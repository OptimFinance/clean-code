import {Constr, Data} from 'lucid'

export const isArrayOf = <T>(typeGuard: (o: any) => o is T) => (o: any): o is T[] => {
  return Array.isArray(o) && o.every(typeGuard)
}

function assertUnreachable(_:  never): never {
  throw new Error('Unreachable')
}

export type SchemaData = BytesData | IntData | ListData | MapData | ConstructorData

type BytesData = { bytes: string }
type IntData = { int: bigint }
type ListData = { list: SchemaData[] }
type ConstructorData = { constructor: bigint, fields: SchemaData[] }
type MapData = { map: { k: SchemaData, v: SchemaData }[] }

const isBytesData = (o: any): o is BytesData => {
  return typeof o.bytes === 'string'
}

const isIntData = (o: any): o is IntData => {
  return typeof o.int === 'bigint'
}

const isListData = (o: any): o is ListData => {
  return isArrayOf(isData)(o.list)
}

const isKVPair = (o: any): o is { k: SchemaData, v: SchemaData } => {
  return isData(o.k) && isData(o.v)
} 

const isMapData = (o: any): o is MapData => {
  return isArrayOf(isKVPair)(o.map)
}

const isConstructorData = (o: any): o is ConstructorData => {
  return typeof o.constructor === 'bigint'
      && isArrayOf(isData)(o.fields) 
}

export const isData = (o: any): o is SchemaData => {
  return isBytesData(o) 
      || isIntData(o) 
      || isListData(o)
      || isMapData(o)
      || isConstructorData(o)
}

export type Encoder<S, T> = {
  name: string | string[],
  subEncoders?: Encoder<any, any>[],
  validator: ((a: S) => T),
  proxy: S | null
}

export type SchemaField = (readonly [string, Encoder<any, any>])
export type Schema = {
    readonly name: string,
    readonly constructor: bigint,
    fields: readonly SchemaField[]
}

type ArrayKeys = keyof readonly any[]
type Indices<T> = Exclude<keyof T, ArrayKeys>

export type SchemaValue<T> = 
  T extends { kind: infer V } 
  ? V extends string 
    ? V 
    : never
  : never

export const id = (v: any) => v
export const rawDataEncoder: Encoder<SchemaData, SchemaData> = { name: 'data', validator: id, proxy: null }
export const bigintEncoder: Encoder<bigint, bigint> = { name: 'bigint', validator: id, proxy: null }
export const stringEncoder: Encoder<string, string> = { name: 'string', validator: id, proxy: null }
export const listEncoder = <T>(encoder: Encoder<T, T>): Encoder<T[], T[]> =>
  ({ name: 'list', subEncoders: [encoder], validator: id, proxy: null })
export const validListEncoder = <S, T>(encoder: Encoder<S, T>): Encoder<S[], T[]> =>
  ({ name: 'list', subEncoders: [encoder], validator: id, proxy: null })
export const mapEncoder = <K, V>(keyEncoder: Encoder<K, K>, valueEncoder: Encoder<V, V>): Encoder<Map<K, V>, Map<K, V>> =>
  ({ name: 'map', subEncoders: [keyEncoder, valueEncoder], validator: id, proxy: null })
export const validMapEncoder = <J, K, U, V>(keyEncoder: Encoder<J, K>, valueEncoder: Encoder<U, V>): Encoder<Map<J, U>, Map<K, V>> =>
  ({ name: 'map', subEncoders: [keyEncoder, valueEncoder], validator: id, proxy: null })
// TODO: maybe this instead of validMapEncoder?
export const validMapEncoder2 = <J, K, U, V>(validator: (map: Map<J, U>) => Map<K, V>): Encoder<Map<J, U>, Map<K, V>> => 
  ({ name: 'map', validator, proxy: null })
export const schemaEncoder = <T>(schemaName: SchemaValue<T>): Encoder<T, T> =>
  ({ name: schemaName, validator: id, proxy: null })

// FIXME: order of constructors in C isn't checked against constructor indices of T
export const unionEncoder = <T extends { kind: C[number] }, C extends string[]>(constructors: C): Encoder<T, T> =>
  ({ name: constructors, validator: id, proxy: null })

export type SchemaToType<S extends Schema> 
  = { kind: S['name'] } 
  & {
    [Index in Indices<S['fields']> as S['fields'][Index] extends readonly [any, unknown] ? S['fields'][Index][0] : never ]:
            S['fields'][Index] extends readonly [string, Encoder<any, any>] ? NonNullable<S['fields'][Index][1]['proxy']> : never
  }

const schemata: Map<string, Schema> = new Map<string, Schema>()
export const addTypeSchema = (schema: Schema) => {
  schemata.set(schema.name, schema)
}

const dataToPlutusData = (data: SchemaData): Data => {
  if (isBytesData(data)) {
    return data.bytes
  } else if (isIntData(data)) {
    return BigInt(data.int)
  } else if (isListData(data)) {
    return data.list.map(dataToPlutusData)
  } else if (isMapData(data)) {
    const map: Map<Data, Data> = new Map()
    data.map.map(({ k, v }) => map.set(dataToPlutusData(k), dataToPlutusData(v)))
    return map
  } else if (isConstructorData(data)) {
    return new Constr(Number(data.constructor), data.fields.map(dataToPlutusData))
  } else {
    assertUnreachable(data)
  }
}

const plutusDataToData = (data: Data): SchemaData => {
  if (typeof(data) == 'bigint')
    return { int: data }
  else if (typeof(data) == 'string')
    return { bytes: data }
  else if (Array.isArray(data))
    return { list: data.map(plutusDataToData) }
  else if (data instanceof Map) {
    const map: MapData = { map: [] }
    data.forEach((v, k) => 
      map.map.push({ k: plutusDataToData(k), v: plutusDataToData(v) })
    )
    return map
  } else if (data instanceof Constr) {
    return {
      constructor: BigInt(data.index),
      fields: data.fields.map(plutusDataToData)
    }
  } else {
    assertUnreachable(data)
  }
}

// FIXME: encode directly as PlutusData instead of going through toData?
export const toPlutusData = (v: any): Data => dataToPlutusData(toData(v))
export const fromPlutusData = <S extends Schema>(schema: S, v: Data): SchemaToType<S> =>
  fromData(schema, plutusDataToData(v))

export const fromData = <S extends Schema>(schema: S, data: SchemaData): SchemaToType<S> => {
  if (isConstructorData(data) && data.constructor === schema.constructor) {
    let index = 0
    const object: any = {
      kind: schema.name,
    }
    const decodeField = (schemaField: SchemaField, fieldData: SchemaData): any => {
      const encoder = schemaField[1];
      switch (encoder.name) {
        case 'data': return fieldData;
        case 'string': return (fieldData as BytesData).bytes;
        case 'bigint': return BigInt((fieldData as IntData).int);
        case 'list':
          if (encoder.subEncoders === undefined)
            throw new Error('Unknown encoder for list items')
          return (fieldData as ListData).list.map((v, i) => decodeField([`${i}`, encoder.subEncoders![0]], v));
        case 'map': {
          if (encoder.subEncoders === undefined)
            throw new Error('Unknown encoder for map items')
          const m: Map<any, any> = new Map();
          (fieldData as MapData).map.forEach(({k, v}, i) => {
            m.set(
              decodeField([`k${i}`, encoder.subEncoders![0]], k),
              decodeField([`v${i}`, encoder.subEncoders![1]], v)
            )
          });
          return m;
        }
        default: {
          let childSchema;
          if (Array.isArray(encoder.name)) {
            if (!isConstructorData(fieldData))
              throw new Error("Union value is not constructor data")
            childSchema = schemata.get(encoder.name[Number((fieldData as ConstructorData).constructor)])
          } else {
            childSchema = schemata.get(encoder.name)
          }
          if (childSchema === undefined)
            throw new Error(`Could not find schema: ${encoder.name}`)
          return fromData(childSchema, fieldData)
        }
      }
    }

    schema.fields.forEach(schemaField => {
      object[schemaField[0]] = decodeField(schemaField, data.fields[index])
      index++
    })
    return object
  } else {
    throw Error('All schema types have constructors')
  }
}

export const toData = (encodable: any, subEncoders?: Encoder<any, any>[]): SchemaData => {
  if (isData(encodable)) {
    return encodable
  } else if (typeof(encodable) === 'bigint') {
    return { int: encodable }
  } else if (typeof(encodable) === 'string') {
    return { bytes: encodable }
  } else if (Array.isArray(encodable)) {
    if (subEncoders !== undefined)
      return {
        list: encodable.map(v => toData(subEncoders[0].validator(v), subEncoders[0].subEncoders))
      }
    else
      return { list: encodable.map(v => toData(v)) }
  } else if (encodable instanceof Map) {
    const mapData: { k: SchemaData, v: SchemaData }[] = []
    encodable.forEach((v, k) => {
      if (subEncoders !== undefined)
        mapData.push({
          k: toData(subEncoders[0].validator(k), subEncoders[0].subEncoders),
          v: toData(subEncoders[1].validator(v), subEncoders[1].subEncoders)
        })
      else
        mapData.push({ k: toData(k), v: toData(v) })
    });
    return { map: mapData }
  } else if (typeof encodable === 'object' && 'kind' in encodable && schemata.has(encodable.kind)) {
    const schema = schemata.get(encodable.kind)
    if (schema === undefined)
      throw new Error(`Schema not found: ${encodable.kind}`)
    return {
      constructor: schema.constructor,
      fields: schema.fields.map(field => {
        return toData(field[1].validator(encodable[field[0]]), field[1].subEncoders)
      })
    }
  } else {
    throw new Error("Don't know how to encode " + JSON.stringify(encodable))
  }
}

export const objectToData = (object: any): SchemaData => {
  if (isData(object)) return object
  else {
    throw Error('not Data')
  }
}

export const parseFromSchema = <S extends Schema>(schema: S) => (o: any): SchemaToType<S> => {
  return fromData(schema, objectToData(o))
}
