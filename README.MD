# StartMyVM - X3

This package contains a script able to start and stop autonomously your X3 vm.

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
- `startMyVM stop` to stop your VM

Optional args

- `config="path"` Enable you to redefine the config file path
- `stop` Enable you to stop your VM instead
- `debug` Show the script actions
