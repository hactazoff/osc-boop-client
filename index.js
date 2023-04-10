#!/usr/bin/env ts-node
"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const octokit_1 = require("octokit");
const fs_1 = require("fs");
const undici_1 = require("undici");
const path_1 = require("path");
const process_1 = require("process");
const child_process_1 = require("child_process");
const events_1 = __importDefault(require("events"));
const yargs_1 = __importDefault(require("yargs"));
const helpers_1 = require("yargs/helpers");
const fs_2 = require("fs");
const stream_1 = require("stream");
const electron_1 = require("electron");
const os_1 = require("os");
const UPDATE_OWNER = "hactazoff";
const UPDATE_REPO = "osc-boop";
const UPDATE_BRANCH = "master";
class Updater extends events_1.default {
    argv;
    octokit;
    gui;
    constructor(argv) {
        super();
        this.argv = argv;
        this.config = argv.config;
        this.octokit = new octokit_1.Octokit({
            auth: "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"
        });
    }
    findNodePath() {
        var dirpaths = [
            (0, path_1.dirname)(process_1.env.NODE || ''),
            (0, path_1.dirname)(process_1.execPath),
            (0, path_1.dirname)((0, process_1.cwd)()),
            ...(process_1.env.Path?.split(';') || [])
        ].map(e => (0, path_1.resolve)(e));
        for (const dirpath of dirpaths)
            if ((0, fs_1.existsSync)((0, path_1.join)(dirpath, 'npm')))
                return (0, path_1.join)(dirpath, 'node');
        return process_1.execPath;
    }
    message(msg) {
        if (this.argv.gui)
            this.gui?.win?.webContents.send('message', msg);
        console.log(msg);
    }
    async update() {
        await this.display();
        this.message("Recherche Mise à jour...");
        const { commit: { sha } } = await this.getInfo();
        const sSha = sha.slice(0, 7);
        const path = (0, path_1.join)((0, process_1.cwd)(), sSha);
        if ((0, fs_1.existsSync)(path))
            if (this.argv['start-at-end']) {
                this.message("Lancement...");
                return await this.runner(['start'], {
                    env: {
                        unref: true
                    },
                    cwd: path,
                    stdio: 'ignore'
                });
            }
            else
                return this.message("Déjà à jour...");
        this.message("Référencement...");
        const download_urls = await this.getDownloadURLs();
        this.message("Téléchargement...");
        await this.downloader(download_urls, path);
        this.message("Installation...");
        await this.runner(['install', '--save'], { cwd: path });
        this._config.UPDATE_SHA = sha;
        this.config = this._config;
        this.message("Construction...");
        await this.runner(['run', 'build'], { cwd: path });
        if (this.argv['start-at-end']) {
            this.message("Lancement...");
            return await this.runner(['start'], {
                env: {
                    unref: true
                },
                cwd: path,
                stdio: 'ignore'
            });
        }
        else
            return this.message("Terminé...");
    }
    async start() {
        await this.display();
        if (typeof this.config.UPDATE_SHA !== "string" && this.config.UPDATE_SHA.length < 7)
            throw 'No Version detected (config).';
        const sSha = this.config.UPDATE_SHA.slice(0, 7);
        const path = (0, path_1.join)((0, process_1.cwd)(), sSha);
        if ((0, fs_1.existsSync)(path))
            return await this.runner(['start'], {
                env: {
                    unref: true
                },
                cwd: path,
                stdio: 'ignore'
            });
        throw 'No Version detected (path).';
    }
    async downloader(download_urls, inpath) {
        (0, fs_1.mkdirSync)(inpath);
        var download = {
            total_size: download_urls.map(e => e.size).reduce((a, b) => a + b, 0),
            total_files: download_urls.length,
            total_file_size: 0,
            total_file_name: download_urls.map(e => e.path),
            curre_size: 0,
            curre_files: 0,
            curre_file_size: 0,
            curre_file_name: ""
        };
        for (const { download_url, type, path, size } of download_urls) {
            if (type != "dir" && download_url) {
                download.curre_file_size = 0;
                download.total_file_size = size;
                download.curre_file_name = path;
                if (this.argv.gui)
                    this.gui?.win?.webContents.send('download', download);
                const write = (0, fs_1.createWriteStream)((0, path_1.join)(inpath, path));
                const response = await (0, undici_1.request)(download_url);
                response.body.pipe(write);
                const self = this;
                response.body.pipe(new class extends stream_1.Writable {
                    _write(chunk, _, next) {
                        download.curre_size += chunk.length;
                        download.curre_file_size += chunk.length;
                        if (self.argv.gui)
                            self.gui?.win?.webContents.send('download', download);
                        next();
                    }
                });
                if (!write.writableFinished)
                    await new Promise(r => write.on('finish', r));
            }
            else
                (0, fs_1.mkdirSync)((0, path_1.join)(inpath, path));
            download.curre_files++;
        }
    }
    async getDownloadURLs(inpath = "") {
        const list = [];
        const { data } = await this.octokit.rest.repos.getContent({
            owner: this.config.UPDATE_OWNER,
            repo: this.config.UPDATE_REPOSITORY,
            branch: this.config.UPDATE_BRANCH,
            path: inpath,
        });
        for (const { download_url, type, path, size, name } of data) {
            list.push({ download_url, type, path, size });
            if (this.argv.gui)
                this.gui?.win?.webContents.send('registring', { download_url, type, path, size, name });
            if (type === "dir")
                list.push(...(await this.getDownloadURLs(path)));
        }
        ;
        return list;
    }
    async getInfo() {
        return (await this.octokit.rest.repos.getBranch({
            owner: this.config.UPDATE_OWNER,
            repo: this.config.UPDATE_REPOSITORY,
            branch: this.config.UPDATE_BRANCH
        })).data;
    }
    runner(args, options) {
        return new Promise(r => {
            if (!options.env)
                options.env = {};
            for (const [k, v] of Object.entries({
                'npm_config_registry': 'https://registry.npmjs.org/',
                'npm_config_cache': (0, path_1.join)((0, process_1.cwd)(), 'node_modules'),
                'updater_config_cwd': options.cwd,
                'updater_config_path': this._config_path
            })) {
                options.env[k] = v;
            }
            const unref = options.env.unref;
            if (unref)
                delete options.env.unref;
            const child = (0, child_process_1.spawn)(this.findNodePath(), [(0, path_1.join)((0, path_1.dirname)(this.findNodePath()), 'node_modules', 'npm', 'bin', 'npm-cli.js'), ...args], options);
            if (unref) {
                setTimeout((d) => {
                    child.unref();
                    r(0);
                }, 1e3);
            }
            else {
                child.stdout.pipe(process.stdout);
                child.stderr.pipe(process.stderr);
                child.on('close', r);
            }
        });
    }
    _config;
    _config_path;
    get config() {
        return this._config;
    }
    set config(val) {
        if (typeof val === "string")
            try {
                this._config_path = val;
                this._config = JSON.parse((0, fs_2.readFileSync)(val).toString());
            }
            catch {
                this._config = {
                    UPDATE_OWNER: UPDATE_OWNER,
                    UPDATE_REPOSITORY: UPDATE_REPO,
                    UPDATE_BRANCH: UPDATE_BRANCH,
                    UPDATE_SHA: ""
                };
            }
        else if (typeof val === "object") {
            if (!this._config_path)
                throw "No path config";
            this._config = val;
        }
        ;
        if (this._config_path && this._config)
            (0, fs_2.writeFileSync)(this._config_path, JSON.stringify(this._config));
    }
    async display() {
        if (this.argv.gui) {
            this.gui = new Interface();
            console.log('Start GUI, waitting...');
            await this.gui.ready();
            console.log('GUI ready !');
        }
        ;
        return;
    }
}
class Interface {
    win;
    constructor() {
    }
    getPreload() {
        var preload = this.preload.toString().split('\n').map(e => e.trim());
        preload = preload.slice(1, preload.length - 1).join('\n').replace(/\r/gi, '');
        const path = (0, path_1.join)((0, os_1.tmpdir)(), 'oscboop-preload.js');
        (0, fs_2.writeFileSync)(path, preload);
        console.log(path);
        return path;
    }
    getHTML() {
        return `PCFET0NUWVBFIGh0bWw+PGh0bWwgbGFuZz0iZnIiPjxoZWFkPjxtZXRhIGNoYXJzZXQ9InV0Zi04Ij48dGl0bGU+T1NDQm9vcCBVcGRhdGVyPC90aXRsZT48c3R5bGU+Ym9keSxodG1se2JhY2tncm91bmQtY29sb3I6IzIwMjAyMDtjb2xvcjojZmZmO2hlaWdodDoxMDAlfWJvZHl7cG9zaXRpb246cmVsYXRpdmU7bWFyZ2luOjJlbTtoZWlnaHQ6Y2FsYygxMDAlIC0gNGVtKTtvdmVyZmxvdzpoaWRkZW47Zm9udC1mYW1pbHk6QXJpYWwsSGVsdmV0aWNhLHNhbnMtc2VyaWZ9KntwYWRkaW5nOjA7bWFyZ2luOjA7b3ZlcmZsb3c6aGlkZGVufSNsb2dnZXJ7b3ZlcmZsb3c6aGlkZGVuO3Bvc2l0aW9uOmFic29sdXRlO2JvdHRvbTowO3dpZHRoOjEwMCU7aGVpZ2h0OmNhbGMoMTAwJSAtIDFlbSl9I2xvZ2dlcj5we3RleHQtYWxpZ246Y2VudGVyfS5tZXNzYWdle3dpZHRoOm1heC1jb250ZW50O3BhZGRpbmc6MWVtO2NvbG9yOiMyMDIwMjA7YmFja2dyb3VuZDpsaW5lYXItZ3JhZGllbnQoNDVkZWcsI2ZmZixhenVyZSk7Ym9yZGVyLXJhZGl1czoxZW07Ym94LXNoYWRvdzouMjVlbSAuMjVlbSAuNWVtIHJnYmEoMjU1LDI1NSwyNTUsLjEpO21hcmdpbjouNWVtfSNwcm9ncmVzcy10b3RhbHttYXJnaW46MWVtO2JvcmRlci1yYWRpdXM6MWVtO3dpZHRoOmNhbGMoMTAwJSAtIDJlbSk7YmFja2dyb3VuZC1jb2xvcjojZmZmMTtwb3NpdGlvbjpmaXhlZDt0b3A6MDtsZWZ0OjA7aGVpZ2h0OmNhbGMoMTAwJSAtIDJlbSl9I2xvZ2dlcj5wOm5vdCg6bGFzdC1jaGlsZCk6bm90KC5wZXJtYW5lbnQpe2FuaW1hdGlvbjpkaXNwbGF5LW5vbmUgM3M7b3BhY2l0eTowO2Rpc3BsYXk6YmxvY2s7d2lkdGg6MDtoZWlnaHQ6MH1Aa2V5ZnJhbWVzIGRpc3BsYXktbm9uZXtmcm9te2Rpc3BsYXk6YmxvY2s7b3BhY2l0eToxO2hlaWdodDp1bnNldDt3aWR0aDp1bnNldH10b3tkaXNwbGF5OmJsb2NrO29wYWNpdHk6MDtoZWlnaHQ6dW5zZXQ7d2lkdGg6dW5zZXR9fTwvc3R5bGU+PC9oZWFkPjxib2R5PjxtYWluPjxkaXYgY2xhc3M9Im1lc3NhZ2UiPjxoMz5PU0MgQm9vcDwvaDM+PC9kaXY+PGRpdiBjbGFzcz0ibWVzc2FnZSIgaWQ9Im1haW4tbWVzc2FnZSI+PC9kaXY+PGRpdiBpZD0ibG9nZ2VyIj48L2Rpdj48ZGl2IGlkPSJwcm9ncmVzcy10b3RhbCI+PC9kaXY+PC9tYWluPjxzY3JpcHQ+d2luZG93LmFkZEV2ZW50TGlzdGVuZXIoImxvYWQiLCgpPT57bGV0IGU9d2luZG93LmRvY3VtZW50Py5nZXRFbGVtZW50QnlJZCgibWFpbi1tZXNzYWdlIiksbj13aW5kb3cuZG9jdW1lbnQ/LmdldEVsZW1lbnRCeUlkKCJsb2dnZXIiKSxvPXdpbmRvdy5kb2N1bWVudD8uZ2V0RWxlbWVudEJ5SWQoInByb2dyZXNzLXRvdGFsIik7Y29uc29sZS5sb2coIm9rIiksY3VycmVfZmlsZXM9LTEsd2luZG93Lm9zY2Jvb3Aub24oIm1lc3NhZ2UiLGZ1bmN0aW9uKG8pe2UuaW5uZXJIVE1MPW87dmFyIHQ9d2luZG93LmRvY3VtZW50Py5jcmVhdGVFbGVtZW50KCJwIik7dC5pbm5lckhUTUw9byxuLmFwcGVuZENoaWxkKHQpLG4uc2Nyb2xsVG9wPW4uc2Nyb2xsSGVpZ2h0fSksd2luZG93Lm9zY2Jvb3Aub24oImRvd25sb2FkIixmdW5jdGlvbihlKXtpZihvLnN0eWxlLndpZHRoPWBjYWxjKCR7ZS5jdXJyZV9zaXplL2UudG90YWxfc2l6ZSoxMDB9JSAtIDJlbSlgLGUuY3VycmVfZmlsZXMhPWN1cnJlX2ZpbGVzKXtjdXJyZV9maWxlcz1lLmN1cnJlX2ZpbGVzO3ZhciB0PXdpbmRvdy5kb2N1bWVudD8uY3JlYXRlRWxlbWVudCgicCIpO3QuaW5uZXJIVE1MPWUuY3VycmVfZmlsZV9uYW1lLG4uYXBwZW5kQ2hpbGQodCl9bi5zY3JvbGxUb3A9bi5zY3JvbGxIZWlnaHR9KSxuYW1lX3JlZ2lzdHJpbmc9IiIsd2luZG93Lm9zY2Jvb3Aub24oInJlZ2lzdHJpbmciLGZ1bmN0aW9uKGUpe2lmKGUubmFtZSE9bmFtZV9yZWdpc3RyaW5nKXt2YXIgbz13aW5kb3cuZG9jdW1lbnQ/LmNyZWF0ZUVsZW1lbnQoInAiKTtvLmlubmVySFRNTD1lLm5hbWUsbi5hcHBlbmRDaGlsZChvKX1uLnNjcm9sbFRvcD1uLnNjcm9sbEhlaWdodH0pfSwhMSk7PC9zY3JpcHQ+PC9ib2R5PjwvaHRtbD4=`;
        return (0, fs_2.readFileSync)('index.html').toString().split('\n').map(e => e.trim()).join('');
    }
    preload() {
        const { contextBridge, ipcRenderer } = require('electron');
        contextBridge.exposeInMainWorld('oscboop', {
            ready: () => ipcRenderer.invoke('ready'),
            on: (event, callback) => ipcRenderer.on(event, (s, ...args) => callback(...args))
        });
    }
    ready() {
        return new Promise(resolve => {
            electron_1.app.whenReady().then(() => {
                this.createWindow();
                this.win?.webContents.on('did-finish-load', resolve);
                electron_1.app.on('activate', () => {
                    if (electron_1.BrowserWindow.getAllWindows().length === 0) {
                        this.createWindow();
                    }
                });
            });
            electron_1.app.on('window-all-closed', () => {
                if (process.platform !== 'darwin') {
                    electron_1.app.quit();
                }
            });
        });
    }
    createWindow() {
        this.win = new electron_1.BrowserWindow({
            width: 200 * 3,
            height: 300 * 2,
            frame: false,
            webPreferences: {
                preload: this.getPreload()
            },
        });
        this.win.loadURL(`data:text/html;base64,` + this.getHTML());
    }
}
(0, yargs_1.default)((0, helpers_1.hideBin)(process_1.argv))
    .command('update', '', (y) => {
    y.option('start-at-end', {
        alias: 's',
        default: true
    });
}, async (argv) => {
    await (new Updater(argv)).update();
    process.exit(1);
})
    .command('start', '', () => { }, async (argv) => {
    await (new Updater(argv)).start();
    process.exit(1);
})
    .command('sha', '', () => { }, async (argv) => {
    const up = new Updater(argv);
    const { commit: { sha } } = await up.getInfo();
    console.log(sha);
})
    .option('config', {
    alias: 'c',
    type: 'string',
    description: 'Path to config file',
    default: (0, path_1.join)((0, process_1.cwd)(), 'config.json')
})
    .option('gui', {
    alias: 'g',
    type: "boolean",
    default: true
})
    .parse();
