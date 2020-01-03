# StartMyVM - X3

This package contains a script able to start and stop autonomously your X3 vm.

## Usage

Just install it globally
> `npm install -g @sage/scm-starter`

Create a _config.yml_ file or use the one given with the package.

```YAML
username: 'Your USERNAME'
password: 'Your PASSWORD' #(Both username and password are for the uranus2 server)
vm: 'Your VM identifier' #Like your unique 3 letter id or the Instance name (upper case)
```

And then you will be able to run

- `startMyVM` to start your VM
- `stopMyVM` to stop your VM

## Optional args

- `config="path/json"` Enable you to redefine the config file path or to give a config object.
- `stop` Switch to stop mode
- `debug` Show the script actions
- `noMessageBox` Does not display any error dialog
- `serverHost` Define the server host URL

## Exposed API

- type `action`: define return from message boxes,
- type `config`,
- type `params`,
- function `parseArgs`: parse the argument list into a params object,
- function `isConfigPath`: check if the given string is a valid config path,
- class `SCMStarter`
  - method `constructor`,
  - method `setParams`,
  - method `getConfig`,
  - method `setConfig`,
  - method `checkServerLink`: attempts to connect to the server host,
  - method `execute`: executes the virtual machine start/stop process,
