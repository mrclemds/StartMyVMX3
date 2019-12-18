#!/usr/bin/env node

import axios from 'axios';
import { existsSync, readFileSync } from 'fs';
import { safeLoad } from 'js-yaml';
import { abortRetryIgnore } from 'mitsobox';
import { resolve } from 'path';
import { launch, Browser } from 'puppeteer';

type config = {
	username: string,
	password: string,
	vm: string,
};

const menuList = {
  start: 'Starts the On Demand Instance',
  stop: 'Stops the On Demand Instance'
};

const serverHost = 'http://uranus2.sagefr.adinternal.com:8144';

const stop = process.argv.indexOf('stop') !== -1;
const debug = process.argv.indexOf('debug') !== -1;
const configFile = (() => {
  const index = process.argv.findIndex((arg) => {
    return arg.indexOf('config') !== -1;
  });
  if(index !== -1) {
    return process.argv[index].replace(/config=/, '');
  }
  return resolve(__dirname, '..', 'config.yml');
})();

if(!existsSync(configFile)) throw Error('Config File does not exists');
const config: config = safeLoad(readFileSync(configFile, 'utf8'));

const isServerLinkAvailable = () => {
  return axios.get(serverHost)
  .then(response => {
    if(response.status !== 200 && response.statusText !== 'OK' && !response.data) throw new Error('Page not found');
    return !!response;
  })
  .catch(err => {
    console.error(err.message);
    return false;
  });
}

const checkServerLink = async (): Promise<boolean | null> => {
  if(debug) console.log('checking server link');
  if(!await isServerLinkAvailable()) {
    const errorMessage = 'Server unreachable';
    // const action: 'ABORT' | 'RETRY' | 'IGNORE' = await mitsobox.abortRetryIgnore('Error', errorMessage);
    const action: 'ABORT' | 'RETRY' | 'IGNORE' = await abortRetryIgnore('Error', errorMessage);
    switch(action) {
      case 'IGNORE':
        return true;
      case 'RETRY':
        return checkServerLink();
      case 'ABORT':
      default:
        console.error(errorMessage);
        return process.exit(1);
    }
  }
  return true;
}

const navigate = async () => {
  let browser: Browser | null = null;

  // ================================================ CHECK SERVER AVAILABILITY
  if(!await checkServerLink()) return;

  try {
    // ================================================ INIT BROWSER
    if(debug) console.log('browser initialization');
    let option = {}
    if(debug) option = { headless: false };
    browser = await launch(option);
    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 937 });
    
    // ================================================ NAVIGATE TO THE VM URL
    if(debug) console.log('getting the login page');
    await page.goto(
      serverHost +
      '/auth/login/page?urlAsk=/syracuse-main/html/main.html?url=%2Fsdata%2Fsyracuse%2Fcollaboration%2Fsyracuse%2Faws_instances%3Frepresentation%3Daws_instance.%24query%26where%3D(name%2520like%2520%27%2525' +
      config.vm +
      '%2525%27)%26filter%3DmyInstances%26startIndex%3D1%26count%3D50'
    );
  
    // ================================================ LOGIN
    if(debug) console.log('trying to log in');
    const loginFormSelector: string = '.s-text > #loginForm';
  
    await page.waitForSelector(loginFormSelector);
    await page.type('.s-text > #loginForm #username', config.username);
    await page.type(loginFormSelector + ' #password', config.password);
    await page.click('.s-text > #loginForm #go-basic');

    
    // ================================================ CHECK LOGIN STATUS
    if(debug) console.log('checking if logged in');
    let error: string | null = null;
    try {
      await page.waitForNavigation({ timeout: 500 });
      await page.waitForSelector('#error-msg', { timeout: 1000 });
      error = await page.evaluate((el: any) => el.innerText, await page.$('#error-msg'), { timeout: 1000 });
    }
    catch(err) {
      if(err.message.indexOf('timeout') < 0) throw err;
    }
    finally {
      if(error) throw Error(error);
    }
  
    // ================================================ GET VM LIST
    if(debug) console.log('getting VM list');
    // await page.waitForNavigation();
    await page.waitForSelector(
      '.s-grid-slot-body > .s-grid-table-body > .s-grid-row > .s-grid-cell > .s-btn-menus'
    );
  
    // ================================================ GET VM STATUS
    if(debug) console.log('getting vm status');
    const index: number = await page.evaluate(
      (el: Element) => (<HTMLTableHeaderCellElement>el.parentNode).cellIndex,
      await page.$(
        '.s-grid-slot-head > .s-grid-table-head > tr > th > div[title="State"]'
      )
    );
    const status = await page.evaluate(
      (el: any) => el.innerText,
      await page.$(
        '.s-grid-slot-body > .s-grid-table-body > .s-grid-row > .s-grid-cell:nth-child(' +
          (index + 1).toString() +
          ') > .s-inplace-value-read'
      )
    );
  
    // ================================================ DEFINE ACTION TO DO
    if(debug) console.log('checking what to do');
    const action = (() => {
      switch (status) {
        case 'running':
            return stop ? menuList.stop : null;
        case 'stopped':
        default:
            return stop ? null : menuList.start;
      }
    })();
    console.log(action ? action : 'Nothing to do');
  
    // ================================================ EXEC ACTION
    if(debug) console.log('try to do it');
    if (!!action) {
      const dropDownMenuSelector = '.s-grid-slot-body > .s-grid-table-body > .s-grid-row > .s-grid-cell > .s-btn-menus';
      await page.waitForSelector(dropDownMenuSelector);
      await page.click(dropDownMenuSelector);
  
      const dropDownMenuActionButton = '.s-mn-popup-body > a[title="'+ action + '"]';
      await page.waitForSelector(dropDownMenuActionButton);
      await page.click(dropDownMenuActionButton);
    }
  }
  catch (error) {
    const errorMessage = 'Navigation error';
    // const action: 'ABORT' | 'RETRY' | 'IGNORE' = await mitsobox.abortRetryIgnore('Error', errorMessage);
    const action: 'ABORT' | 'RETRY' | 'IGNORE' = await abortRetryIgnore('Error', errorMessage);
    switch(action) {
      case 'IGNORE':
        break;
      case 'RETRY':
        navigate();
        break;
      case 'ABORT':
      default:
        console.error(errorMessage);
        console.error(error.message);
        process.exit(1);
    }
  }
  finally {
    // ================================================ CLOSE BROWSER
    if(debug) console.log('closing the browser');
    if(browser) await browser.close();
  }
};

navigate();
