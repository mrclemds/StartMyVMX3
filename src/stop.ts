import { exec } from 'shelljs';

exec('node . stop ' + process.argv.slice(2, process.argv.length)?.join(' '), statusCode => {
    process.exit(statusCode);
});