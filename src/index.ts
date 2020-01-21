#!/usr/bin/env node

/* eslint-disable node/no-missing-import */
import { isConfigPath, params, parseArgs, SCMStarter } from './utils';
export * from './utils';

let configFile = '';
const params: params = {};
let manager: SCMStarter;
let argV = process.argv.slice(2, process.argv.length);

const getConfig = ((): boolean => {
  const index = argV.findIndex(arg => {
    return arg.includes('config');
  });

  const exists = index !== -1;
  let isPath = false;

  if (exists) {
    const config = argV[index].replace(/config=/, '');
    isPath = isConfigPath(config);

    if (isPath) {
      configFile = config;
      argV = argV.filter((arg, argIndex) => {
        if (index !== argIndex) return arg;
      });
    } else {
      const test = config.split("'");

      if (config.includes('password')) {
        for (let i = 3; i <= test.length; i++) {
          if (i === 3 || (i - 3) % 4 === 0) {
            test[i] = '****';
          }
        }
      }
      console.warn('config: ', test.join("'"), '\nwould be considered as a JSON object');
    }
  }

  return isPath;
})();

const parameters = ((): params => {
  return parseArgs(argV);
})();

if (getConfig) {
  manager = new SCMStarter(parameters, configFile);
} else {
  manager = new SCMStarter(parameters);
}

(async (): Promise<void> => {
  if (await manager.checkServerLink()) {
    await manager.execute();
  }
})();
