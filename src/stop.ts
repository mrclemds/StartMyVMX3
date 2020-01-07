#!/usr/bin/env node

import { exec } from 'shelljs';

const preparedArgs = ((): string => {
  return process.argv
    .slice(2, process.argv.length)
    ?.map(arg => {
      if (!arg.includes('=')) return arg;
      const argEntries = arg.split('=');
      argEntries[1] = `"${argEntries[1]}"`;
      return argEntries.join('=');
    })
    .join(' ');
})();

exec('node . stop ' + preparedArgs, statusCode => {
  if (statusCode === 1) throw new Error('Process exited with status code 1');
});
