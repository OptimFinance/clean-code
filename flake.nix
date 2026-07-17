{
  description = "Optim Clean Code";
  inputs.nixpkgs.url = "github:nixos/nixpkgs";
  inputs.flake-utils.url = "github:numtide/flake-utils";
  inputs.aiken.url = "github:aiken-lang/aiken";
  outputs = { self, nixpkgs, flake-utils, aiken }:
    let
      systems = [ "x86_64-linux" "x86_64-darwin" ];
      perSystem = nixpkgs.lib.genAttrs systems;
      # not working...
      withGitRev = package: package.overrideAttrs(_: { gitRev = self.rev or "dirty git tree"; });
      getFlakeRoot = ''
        function find_flake_root {
          [ $(dirname "$1") = "$1" ] && exit 1
          stat "$1/flake.nix" &>/dev/null && echo "$1" && return
          find_flake_root $(dirname "$1")
        }
        [ -z "$FLAKE_ROOT" ] && FLAKE_ROOT=$(find_flake_root $(realpath ./))
        [ -z "$FLAKE_ROOT" ] && echo "Couldn't find flake root" && exit 1
      '';
      setupAikenDependencies = ''
        ${getFlakeRoot}
        
        mkdir -p "$FLAKE_ROOT/oada/build/packages/"
        
        cat > "$FLAKE_ROOT/oada/build/packages/packages.toml" <<EOF
[[packages]]
name = "optimfinance/aiken-common"
version = "0.1.0"
source = "github"
EOF
        
        ln -nfs "$FLAKE_ROOT/aiken-common" "$FLAKE_ROOT/oada/build/packages/optimfinance-aiken-common"
      '';
    in
      flake-utils.lib.eachSystem systems (system:
        let
          pkgs = import nixpkgs { inherit system; };
        in
          {
            devShells.default = pkgs.mkShell {
              shellHook = ''
                ${setupAikenDependencies}
              '';
              buildInputs = with pkgs; [
                aiken.packages.${system}.aiken
                deno
                nodejs
                typst
              ];
            };

            packages.aikenTests = pkgs.writeShellScriptBin "run-aiken-tests" ''
              ${setupAikenDependencies}
              cd "$FLAKE_ROOT/oada" && ${aiken.packages.${system}.aiken}/bin/aiken check
            '';

            packages.emulatorTests = pkgs.writeShellScriptBin "run-emulator-tests" ''
              ${getFlakeRoot}
              ${setupAikenDependencies}
              cd "$FLAKE_ROOT/oada" && ${aiken.packages.${system}.aiken}/bin/aiken build -t verbose
              cd "$FLAKE_ROOT/aiken-common" && ${aiken.packages.${system}.aiken}/bin/aiken build -t verbose
              ${pkgs.deno.out}/bin/deno run --allow-all "$FLAKE_ROOT/test/src/main.ts"
            '';
          }
      );
}
