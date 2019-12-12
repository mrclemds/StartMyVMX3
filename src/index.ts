#!/usr/bin/env node

// import * as puppeteer from 'puppeteer';
import { resolve as resolvePath } from 'path';
import { existsSync } from 'fs';
import { safeLoad } from 'js-yaml';

// TODO use typescript imports
const readFileSync = require('fs').readFileSync;
const puppeteer = require("puppeteer");

type config = {
	username: string,
	password: string,
	vm: string,
};

const menuList = {
  start: "Starts the On Demand Instance",
  stop: "Stops the On Demand Instance"
};

const stop = process.argv.indexOf("stop") !== -1;
const configFile = (() => {
  const index = process.argv.findIndex((arg) => {
    return arg.indexOf('config') !== -1;
  });
  if(index !== -1) {
    return process.argv[index].replace(/config=/, '');
  }
  return resolvePath(__dirname, '..', 'config.yml');
})();

if(!existsSync(configFile)) throw Error('Config File does not exists');
const config: config = safeLoad(readFileSync(configFile));

(async () => {
  // ================================================ INIT BROWSER
	// const browser = await puppeteer.launch({ headless: false });
	const browser = await puppeteer.launch();
  const page = await browser.newPage();
	await page.setViewport({ width: 1920, height: 937 });
	
  // ================================================ NAVIGATE TO THE VM URL
  await page.goto(
    "http://uranus2.sagefr.adinternal.com:8144/auth/login/page?urlAsk=/syracuse-main/html/main.html?url=%2Fsdata%2Fsyracuse%2Fcollaboration%2Fsyracuse%2Faws_instances%3Frepresentation%3Daws_instance.%24query%26where%3D(name%2520like%2520%27%2525" +
			config.vm +
      "%2525%27)%26filter%3DmyInstances%26startIndex%3D1%26count%3D50"
  );

  // ================================================ LOGIN
	const loginFormSelector: string = ".s-text > #loginForm";

  await page.waitForSelector(loginFormSelector);
  await page.type(".s-text > #loginForm #username", config.username);
  await page.type(loginFormSelector + " #password", config.password);
  await page.click(".s-text > #loginForm #go-basic");

  // ================================================ GET VM LIST
  await page.waitForNavigation();
  await page.waitForSelector(
    ".s-grid-slot-body > .s-grid-table-body > .s-grid-row > .s-grid-cell > .s-btn-menus"
  );

  // ================================================ GET VM STATUS
  const index: number = await page.evaluate(
    (el: Element) => (<HTMLTableHeaderCellElement>el.parentNode).cellIndex,
    await page.$(
      '.s-grid-slot-head > .s-grid-table-head > tr > th > div[title="State"]'
    )
  );
  const status = await page.evaluate(
    (el: any) => el.innerText,
    await page.$(
      ".s-grid-slot-body > .s-grid-table-body > .s-grid-row > .s-grid-cell:nth-child(" +
        (index + 1).toString() +
        ") > .s-inplace-value-read"
    )
	);

  // ================================================ DEFINE ACTION TO DO
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
	if (!!action) {
		const dropDownMenuSelector = '.s-grid-slot-body > .s-grid-table-body > .s-grid-row > .s-grid-cell > .s-btn-menus'
    await page.waitForSelector(dropDownMenuSelector);
    await page.click(dropDownMenuSelector);

		const dropDownMenuActionButton = '.s-mn-popup-body > a[title="'+ action + '"]'
    await page.waitForSelector(dropDownMenuActionButton);
    await page.click(dropDownMenuActionButton);
	}

  // ================================================ CLOSE BROWSER
    await browser.close();
})();
