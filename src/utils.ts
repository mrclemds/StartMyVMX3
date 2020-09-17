import axios from 'axios';
import { existsSync, readFileSync } from 'fs';
import { safeLoad } from 'js-yaml';
import { isEqual } from 'lodash';
import { abortRetryIgnore } from 'mitsobox';
import { parse, ParsedPath, resolve } from 'path';
import { Browser, launch } from 'puppeteer';

function tryParseConfigPath(path: string): false | ParsedPath {
  try {
    return resolve(path) === path && parse(path);
  } catch (error) {
    console.error(`Cannot resolve ${path}`);
    return false;
  }
}

export type config = {
  username: string;
  password: string;
  vm: string;
};

export type params = {
  stop?: string;
  debug?: string;
  noMessageBox?: string;
  serverHost?: string;
  config?: config | string;
};

export type action = 'ABORT' | 'RETRY' | 'IGNORE';

export function isConfigPath(arg: string): boolean {
  return !!tryParseConfigPath(arg);
}

export function parseArgs(argv: string[]): params {
  argv.forEach((value, index) => {
    argv[index] = value.replace(/[']/g, '"').replace(/[\\]/g, '');
  });

  if (argv.length === 0) return {};

  return argv
    .map(arg => {
      if (/[=]/g.exec(arg)) {
        const entry = arg.split('=');
        if (entry[0] === 'config') return JSON.parse(`{ "${entry[0]}": ${entry[1]} }`) as params;
        return JSON.parse(`{ "${entry[0]}": "${entry[1]}" }`) as params;
      }
      return JSON.parse(`{ "${arg}": "true"}`) as params;
    })
    .reduce((accumulator, current) => {
      if (['stop', 'debug', 'noMessageBox', 'serverHost', 'config'].includes(Object.keys(current)[0])) {
        return {
          ...accumulator,
          ...current,
        };
      } else {
        return accumulator;
      }
    });
}

export class SCMStarter {
  private config: config = {
    username: 'foo',
    password: 'bar',
    vm: 'ZZZ',
  };

  private menuList = {
    start: 'Starts the On Demand Instance',
    stop: 'Stops the On Demand Instance',
  };

  public constructor(public params?: params, private configFile?: string) {
    if (configFile) this.setConfig(configFile);
    else if (params?.config === undefined) this.findConfigFile();
    else this.setConfig(params.config);

    if (!this.params) {
      this.setParams({
        debug: 'false',
        stop: 'false',
        noMessageBox: 'true',
      });
    }

    if (!this.params?.serverHost || this.params?.serverHost === '') {
      this.setParams({ serverHost: 'http://uranus2.sagefr.adinternal.com:8144' });
    }
  }

  public setParams(parameters?: params): void {
    this.params = {
      ...this.params,
      ...parameters,
    };
  }

  public setConfig(configuration: config | string): void {
    if (typeof configuration === 'string') {
      this.config = this.findConfigFile(configuration);
    } else {
      if (isEqual(this.config, { username: 'foo', password: 'bar', vm: 'ZZZ' })) {
        this.config = this.findConfigFile();
      }
      Object.keys(configuration).forEach(item => {
        const key = item as keyof config;

        if (this.config[key] !== configuration[key] && !!configuration[key]) {
          this.config[key] = configuration[key];
        }
      });
    }
  }

  public getConfig(): config {
    return { ...this.config };
  }

  public async checkServerLink(): Promise<boolean | null> {
    if (this.params?.debug === 'true') console.log('checking server link');
    if (!(await this.isServerLinkAvailable())) {
      switch (await this.messageBox('Error', 'Server unreachable')) {
        case 'IGNORE':
          return true;
        case 'RETRY':
          return this.checkServerLink();
        case 'ABORT':
        default:
          if (this.params?.debug === 'true') console.log(this.configFile, ':', JSON.stringify(this.config));
          throw new Error('');
      }
    }
    return true;
  }

  public async execute(): Promise<void> {
    let browser: Browser | null = null;

    try {
      // ================================================ INIT BROWSER
      if (this.params?.debug === 'true') console.log('browser initialization');
      let option = {};
      if (this.params?.debug === 'true') option = { headless: false };
      browser = await launch(option);
      const page = await browser.newPage();
      await page.setViewport({ width: 1920, height: 937 });

      // ================================================ NAVIGATE TO THE VM URL
      if (this.params?.debug === 'true') console.log('getting the login page');
      await page.goto(
        this.params?.serverHost +
          '/auth/login/page?urlAsk=/syracuse-main/html/main.html?url=%2Fsdata%2Fsyracuse%2Fcollaboration%2Fsyracuse%2Faws_instances%3Frepresentation%3Daws_instance.%24query%26where%3D(name%2520like%2520%27%2525' +
          this.config.vm +
          '%2525%27)%26filter%3DmyInstances%26startIndex%3D1%26count%3D50',
      );

      // ================================================ LOGIN
      if (this.params?.debug === 'true') console.log('trying to log in');
      const loginFormSelector = '.s-text > #loginForm';

      await page.waitForSelector(loginFormSelector);
      await page.type('.s-text > #loginForm #username', this.config.username);
      await page.type(loginFormSelector + ' #password', this.config.password);
      await page.click('.s-text > #loginForm #go-basic');

      // ================================================ CHECK LOGIN STATUS
      if (this.params?.debug === 'true') console.log('checking if logged in');
      let error: string | null = null;
      try {
        await page.waitForNavigation({ timeout: 500 });
        await page.waitForSelector('#error-msg', { timeout: 1000 });
        error = await page.evaluate((el: HTMLElement) => el.innerText, await page.$('#error-msg'), { timeout: 1000 });
      } catch (err) {
        if (err.message.indexOf('timeout') < 0) throw err;
      } finally {
        (): void => {
          if (error) throw Error(error);
        };
      }

      // ================================================ GET VM LIST
      if (this.params?.debug === 'true') console.log('getting VM list');
      // await page.waitForNavigation();
      await page.waitForSelector('.s-grid-slot-body > .s-grid-table-body > .s-grid-row > .s-grid-cell > .s-btn-menus');

      // ================================================ GET VM STATUS
      if (this.params?.debug === 'true') console.log('getting vm status');
      const index: number = await page.evaluate(
        (el: Element) => (el.parentNode as HTMLTableHeaderCellElement).cellIndex,
        await page.$('.s-grid-slot-head > .s-grid-table-head > tr > th > div[title="State"]'),
      );
      const status = await page.evaluate(
        (el: HTMLElement) => el.innerText,
        await page.$(
          '.s-grid-slot-body > .s-grid-table-body > .s-grid-row > .s-grid-cell:nth-child(' +
            (index + 1).toString() +
            ') > .s-inplace-value-read',
        ),
      );

      // ================================================ DEFINE ACTION TO DO
      if (this.params?.debug === 'true') console.log('checking what to do');
      const action = ((): string | null => {
        switch (status) {
          case 'running':
            return this.params?.stop === 'true' ? this.menuList.stop : null;
          case 'stopped':
          default:
            return this.params?.stop === 'true' ? null : this.menuList.start;
        }
      })();
      console.log(action ? action : 'Nothing to do');

      // ================================================ EXEC ACTION
      if (this.params?.debug === 'true') console.log('try to do it');
      if (action) {
        const dropDownMenuSelector =
          '.s-grid-slot-body > .s-grid-table-body > .s-grid-row > .s-grid-cell > .s-btn-menus';
        await page.waitForSelector(dropDownMenuSelector);
        await page.click(dropDownMenuSelector);

        const dropDownMenuActionButton = '.s-mn-popup-body > a[title="' + action + '"]';
        await page.waitForSelector(dropDownMenuActionButton);
        await page.click(dropDownMenuActionButton);
      }
    } catch (error) {
      switch (await this.messageBox('Error', 'Navigation error')) {
        case 'IGNORE':
          break;
        case 'RETRY':
          this.execute();
          break;
        case 'ABORT':
        default:
          throw new Error(error.message);
      }
    } finally {
      // ================================================ CLOSE BROWSER
      if (this.params?.debug === 'true') console.log('closing the browser');
      if (browser) await browser.close();
    }
  }

  private findConfigFile(path?: string): config {
    if (!path) {
      this.configFile = resolve(__dirname, '..', 'config.yml');
    } else {
      this.configFile = resolve(path);
    }

    if (!existsSync(this.configFile)) {
      this.messageBox('Error', 'Config File does not exists')?.then(action => {
        switch (action) {
          case 'IGNORE':
            break;
          case 'RETRY':
            return this.findConfigFile(path);
          case 'ABORT':
          default:
            if (this.params?.debug === 'true') console.log(this.configFile, ':', JSON.stringify(this.config));
            throw new Error();
        }
      });
    }

    let config: config | null = null;

    try {
      config = safeLoad(readFileSync(this.configFile, 'utf8')) as config;
    } catch (error) {
      this.messageBox('Error', 'Not a valid config File')?.then(action => {
        switch (action) {
          case 'IGNORE':
            return config;
          case 'RETRY':
            return this.findConfigFile(path);
          case 'ABORT':
          default:
            if (this.params?.debug === 'true') console.log(this.configFile, ':', JSON.stringify(this.config));
            throw new Error();
        }
      });
    }

    return config ? config : this.config;
  }

  private isServerLinkAvailable(): Promise<boolean> {
    if (this.params?.serverHost) {
      return axios
        .get(this.params.serverHost)
        .then(response => {
          if (response.status !== 200 && response.statusText !== 'OK' && !response.data)
            throw new Error('Page not found');
          return !!response;
        })
        .catch(err => {
          console.error(err.message);
          return false;
        });
    }

    return new Promise<boolean>(resolve => {
      resolve(false);
    });
  }

  private messageBox(title: string, message: string): Promise<action> | null {
    if (this.params?.noMessageBox !== 'true') {
      return abortRetryIgnore(title, message);
    } else {
      console.error(title, '\n' + message);
      return null;
    }
  }
}
