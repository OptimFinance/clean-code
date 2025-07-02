# Developer Guidelines

This document provides comprehensive guidelines for developers contributing to the OADA UNHCR Yield Donation Module project.

## 📋 Table of Contents

- [Getting Started](#getting-started)
- [Code Style](#code-style)
- [Contract Development](#contract-development)
- [Testing Guidelines](#testing-guidelines)
- [Security Considerations](#security-considerations)
- [Contributing](#contributing)

## 🚀 Getting Started

### Prerequisites

- [Aiken](https://aiken-lang.org/) compiler (v1.9.0+)
- [Nix](https://nixos.org/) package manager
- Cardano development environment

### Installation

1. **Clone the repository**:

   ```bash
   git clone https://github.com/OptimFinance/clean-code.git
   cd yield-donation
   ```

2. **Setup development environment**:

   ```bash
   nix develop
   ```

3. **Install dependencies**:
   ```bash
   cd oada
   aiken check
   ```

### Project Structure

```
oada-donate/
├── oada/                 # Main Aiken project
│   ├── validators/       # Smart contract validators
│   ├── lib/              # Library modules
│   ├── aiken.toml        # Project configuration
│   └── plutus.json       # Plutus compatibility layer
├── aiken-common/         # Shared Aiken utilities
├── test/                 # Test suite
├── flake.nix             # Nix development environment
└── README.md             # This file
```

## 👨‍💻 Code Style

### Naming Conventions

- **Functions and Variables**: Use `snake_case`
- **Types and Validators**: Use `PascalCase`
- **Private Functions**: Prefix with underscore (`_`)

### Documentation

- Document all public functions with clear descriptions
- Include parameter types and return values
- Add examples for complex logic
- Use inline comments for business logic explanations

### Error Handling

- Use `expect` for required values
- Provide meaningful error messages
- Handle edge cases explicitly
- Validate inputs thoroughly

## 🔧 Contract Development

### Adding New Validators

1. **Create the validator file** in `oada/validators/`
2. **Define the datum type** with clear field descriptions
3. **Implement required functions**:
   - `mint/2` for minting operations
   - `spend/3` for spending operations
4. **Add comprehensive tests**

#### Example Validator Structure

```aiken
validator(parameter1: Type1, parameter2: Type2) {
  fn mint(redeemer: RedeemerType, ctx: ScriptContext) {
    // Minting logic
  }

  fn spend(datum: DatumType, redeemer: RedeemerType, ctx: ScriptContext) {
    // Spending logic
  }
}
```

### Validation Functions

When creating validation functions in `lib/oada/validation.ak`:

1. **Use clear parameter names**
2. **Document the business logic**
3. **Handle all edge cases**
4. **Return boolean values for validation**

### Datum and Redeemer Design

#### Datum Guidelines

- Keep datum structures minimal and focused
- Use descriptive field names
- Include validation constraints in the datum when possible
- Document the purpose of each field

#### Redeemer Guidelines

- Design redeemers to be explicit about the action being performed
- Use sum types for different operations
- Include necessary parameters for validation
- Keep redeemers immutable and stateless

### Common Patterns

#### Input Validation

```aiken
fn validate_input(input: Input, ctx: ScriptContext) -> Bool {
  and{
    // Check input exists
    list.has(ctx.transaction.inputs, input)?,
    // Validate input value
    value.quantity_of(input.output.value, token_policy, "") > 0?,
    // Check authorization
    list.has(ctx.transaction.extra_signatories, required_key)?
  }
}
```

#### Output Validation

```aiken
fn validate_output(output: Output, expected_value: Int) -> Bool {
  and{
    // Check output value
    value.quantity_of(output.value, token_policy, "") == expected_value?,
    // Validate address
    output.address.payment_credential == expected_credential?,
    // Check datum if required
    output.datum == expected_datum?
  }
}
```

## 🧪 Testing Guidelines

### Test Types

1. **Unit Tests**: Test individual functions
2. **Integration Tests**: Test validator interactions
3. **Property Tests**: Test invariants and properties
4. **Edge Cases**: Test boundary conditions

### Test Structure

```aiken
test test_function_name() {
  // Setup
  let input = create_test_input()

  // Execute
  let result = function_under_test(input)

  // Assert
  result == expected_output
}
```

### Testing Best Practices

- **Test Coverage**: Aim for 100% coverage of public functions
- **Edge Cases**: Test boundary conditions and error cases
- **Property Testing**: Use property-based testing for complex logic
- **Integration Testing**: Test validator interactions thoroughly
- **Mock Data**: Use realistic test data that matches production scenarios

### Running Tests

```bash
# Run all tests
cd oada
aiken test

# Run tests in watch mode
aiken test --watch

# Run specific test file
aiken test validators/donate_soada.ak

# Run tests with coverage
aiken test --coverage
```

## 🔒 Security Considerations

### Input Validation

- Validate all inputs thoroughly
- Check for malicious or unexpected data
- Implement proper bounds checking
- Validate cryptographic signatures

### Access Control

- Implement proper authorization checks
- Use whitelists for privileged operations
- Verify signatories for sensitive actions
- Implement role-based access control

### Resource Limits

- Set appropriate limits for operations
- Prevent resource exhaustion attacks
- Implement rate limiting where applicable
- Monitor gas consumption

### Audit Trail

- Maintain clear transaction logs
- Include sufficient context in redeemers
- Log important state changes
- Enable transaction tracing

### Common Security Patterns

#### Authorization Check

```aiken
fn check_authorization(required_key: KeyHash, ctx: ScriptContext) -> Bool {
  list.has(ctx.transaction.extra_signatories, required_key)
}
```

#### Value Validation

```aiken
fn validate_value(amount: Int, min: Int, max: Int) -> Bool {
  and{
    amount >= min,
    amount <= max
  }
}
```

#### State Transition Validation

```aiken
fn validate_state_transition(old_state: State, new_state: State) -> Bool {
  // Ensure state transitions are valid
  and{
    new_state.version > old_state.version,
    new_state.timestamp > old_state.timestamp,
    // Add other validation rules
  }
}
```

## 🤝 Contributing

### Development Workflow

1. **Fork the repository**
2. **Create a feature branch**: `git checkout -b feature/your-feature`
3. **Make your changes** following the development guidelines
4. **Add tests** for new functionality
5. **Run the test suite**: `aiken test`
6. **Submit a pull request**

### Pull Request Guidelines

1. **Clear description** of changes
2. **Reference related issues**
3. **Include tests** for new functionality
4. **Update documentation** if needed
5. **Ensure all tests pass**

### Code Review Process

1. **Automated checks** must pass
2. **At least one review** from maintainers
3. **Address feedback** before merging
4. **Squash commits** for clean history

### Commit Message Guidelines

Use conventional commit format:

```
type(scope): description

[optional body]

[optional footer]
```

Types:

- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes
- `refactor`: Code refactoring
- `test`: Test changes
- `chore`: Build/tooling changes

### Code Review Checklist

- [ ] Code follows style guidelines
- [ ] Tests are included and passing
- [ ] Documentation is updated
- [ ] Security considerations addressed
- [ ] Performance impact considered
- [ ] Error handling implemented
- [ ] Edge cases covered

## 📚 Additional Resources

- [Aiken Documentation](https://aiken-lang.org/)
- [Cardano Developer Portal](https://developers.cardano.org/)
- [Plutus Documentation](https://plutus.readthedocs.io/)
- [Aiken Style Guide](https://aiken-lang.org/style-guide)

## 📄 License

This project is licensed under the MIT License - see the [LICENSE.md](../LICENSE.md) file for details.

## 🆘 Getting Help

- **Issues**: [GitHub Issues](https://github.com/OptimFinance/clean-code/issues)
- **Discussions**: [GitHub Discussions](https://github.com/OptimFinance/clean-code/discussions)

---

**Note**: These guidelines are living documents. Please contribute improvements and updates as the project evolves.
