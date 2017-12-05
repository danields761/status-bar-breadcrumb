'use strict';

// The module 'vscode' contains the VS Code extensibility API
import * as path from "path";
import * as os from "os";
import * as fs from "fs";
import * as minimatch from "minimatch";
import * as vscode from "vscode";
import {Disposable} from "vscode";

import {ExtensionConfig} from "./config";


const log = console;


// utils
function _isDirectory(file) {
    let stat = fs.statSync(file);  // probably slow
    return stat.isDirectory();
}

function createBreadCrumbItemsFromFile(fileUri, callback) {
    // this wall of code full of shit but do exactly what it should
    // no power to refactor it
    let fileName = path.normalize(fileUri.fsPath);
    let selectedPath = fileName;
    let homeDir = path.normalize(os.homedir());
    let workspaceDirs = vscode.workspace.workspaceFolders;
    let homeFound = false;
    let workspaceFound = false;
    let selectedWorkspaceName = null;
    let selectedWorkspaceAbs = null;

    // find intersections with such root dirs as home and workspace
    homeFound = fileName.includes(fileName);
    if (homeFound) {
        selectedPath = path.relative(homeDir, fileName);
    }
    let ws = vscode.workspace.getWorkspaceFolder(fileUri);
    if (ws) {
        let wsd = ws.uri.fsPath;
        selectedPath = path.relative(wsd, fileName);
        workspaceFound = true;
        selectedWorkspaceName = ws.name;
        selectedWorkspaceAbs = wsd;
    }

    // create list of breadcrumb items
    let breadcrumbItems = [];
    let parsedFileName = path.parse(selectedPath);
    let aggregatedPath = null;

    // push root found node
    if (workspaceFound) {
        breadcrumbItems.push(
            [
                `$(file-submodule) ${selectedWorkspaceName}`, 'Workspace root',
                callback, selectedWorkspaceAbs
            ]
        );
        aggregatedPath = selectedWorkspaceAbs;
    } else if (homeFound) {
        breadcrumbItems.push(
            [`$(home)`, 'Home', callback, homeDir]
        );
        aggregatedPath = homeDir;
    } else {
        breadcrumbItems.push(
            [` / `, 'Project root', callback, parsedFileName.root]
        );
        aggregatedPath = parsedFileName.root;
    }

    // push itermediate parts
    for (
        let part of parsedFileName.dir.split(
            path.sep
        ).filter(a => !!a)
    ) {
        aggregatedPath = path.join(aggregatedPath, part);
        breadcrumbItems.push(
            [
                `$(chevron-right)\t${part}`, `Folder ${part}`,
                callback, aggregatedPath
            ]
        )
    }
    breadcrumbItems.push(
        [
            `$(chevron-right)\t${parsedFileName.base}`, 'Current file',
            () => {}, path.join(aggregatedPath, parsedFileName.base)
        ]
    )

    return breadcrumbItems.reverse();
}


/**
 * Quick-pick navigation menu
 */
class NavigationQuickPickMenu extends Disposable {
    /**
     * Create menu with callbacks
     * @param {*} excludePatterns list of regexps to preform excluding
     * @param {*} fileSelectedCallback call in file selected using menu
     * @param {*} dirSelectedCallback if not set will be called recursively
     */
    constructor(excludePatterns, fileSelectedCallback, dirSelectedCallback) {
        super();
        this._fileCallback = fileSelectedCallback;
        this._dirCallback = dirSelectedCallback;
        this._excludePatterns = excludePatterns;
        this._currentCancellationToken = null;
        if (dirSelectedCallback == undefined || dirSelectedCallback === null)
            this._dirCallback = (abs, name) => this.showDir(abs);
    }

    /**
     * Create menu for directory
     * @param {*} dir given directory
     */
    showDir(dir) {
        // list current dir files splitting them into files and directories
        let dirs = [];
        let files = [];
        fs.readdirSync(dir).map(
            f => path.normalize(path.join(dir, f))
        ).filter(
            f => !this._excludePatterns.some(p => p.test(f))
        ).forEach(
            absolute => {
                let name = path.basename(absolute);
                if (_isDirectory(absolute))
                    dirs.push({label: `$(file-directory) ${name}`, detail: absolute});
                else
                    files.push({label: name, detail: absolute});
            }
        );
        // show menu items, on then call appropriate callback
        this._currentCancellationToken = new vscode.CancellationTokenSource();
        vscode.window.showQuickPick(
            [
                {label: '..', detail: path.join(dir, '..')}
            ].concat(dirs.sort().concat(files.sort()))
        ).then(
            selected => {
                this._currentCancellationToken = null;
                if (selected == undefined)
                    return;

                if (_isDirectory(selected.detail))
                    this._dirCallback(selected.detail, selected.name);
                else
                    this._fileCallback(selected.detail, selected.name);
            }
        );
    }

    dispose() {
        if (this._currentCancellationToken) {
            this._currentCancellationToken.dispose();
            this._currentCancellationToken = null;
        }
    }
}

/**
 * Class is untended to group and control multiple status-bar items at once
 *  providing multiple control methods like
 *  @see [show](#MultipleStatusBarItem.show) and @see [hide](#MultipleStatusBarItem.hide)
 */
class MultipleStatusBarItem extends Disposable {
    constructor(align) {
        super();
        this._basePriority = -50;
        this._subItems = [];
        this._subItemCommandHandles = [];
        this._sbAlign = align || vscode.StatusBarAlignment.Left;
    }

    /**
     * Set group of status-bar items strictly aligned together
     * @param items
     * list of tuples in form (item_label, callable, callable_args)
     */
    setItems(items) {
        this.dispose();

        let num = 0;
        for (let [text, hint, callable, args] of items) {
            let r_item = vscode.window.createStatusBarItem(
                this._sbAlign, this._basePriority + num++
            );

            let command = 'extension._internalCommand' + num;
            let command_handle = vscode.commands.registerCommand(
                command, () => callable(args)
            );

            r_item.text = text;
            r_item.command = command;
            r_item.tooltip = hint;

            this._subItems.push(r_item);
            this._subItemCommandHandles.push(command_handle);
        }
    }

    /**
     * Show elements
     */
    show() {
        for (let item of this._subItems) {
            item.show();
        }
    }

    /**
     * Hide elements
     */
    hide() {
        for (let item of this._subItems) {
            item.hide();
        }
    }

    dispose() {
        for (let item of this._subItems) {
            item.dispose();
        }
        for (let handle of this._subItemCommandHandles) {
            handle.dispose();
        }
    }
}


/**
 * Extension entry point with global state
 */
class StatusBarBreadCrumbExtension extends Disposable {
    constructor() {
        super();
        this._statusBarItem = null;
        this._navigationMenu = null;
        this._config = null;
    }

    /**
     * Same as `extension.activate`
     * @param {*} context extension context
     */
    activate(context) {
        // Register commands
        for (let [command_name, command_func] of StatusBarBreadCrumbExtension.COMMANDS_AGGREGATED) {
            vscode.commands.registerCommand(
                command_name, command_func.bind(this)
            );
        }

        // reload on config change
        vscode.workspace.onDidChangeConfiguration(this.reload.bind(this));

        // Subscribe for current document changed events
        vscode.window.onDidChangeActiveTextEditor(this._onNewTextEditor.bind(this));

        // Create status bar item
        this._statusBarItem = new MultipleStatusBarItem();

        // initialize
        this._initialize();
    }

    /**
     * Perform extension reloading
     * Dont need to recreate all resources
     */
    reload() {
        log.debug('Reloading configuration ...');

        // dispose before recreating
        this._navigationMenu.dispose();

        // initialize again
        this._initialize();
    }

    dispose() {
        this._statusBarItem.dispose();
        if (this._navigationMenu)
            this._navigationMenu.dispose();
    }

    // private
    _initialize() {
        // Get configuration
        let config = new ExtensionConfig(vscode.workspace.getConfiguration());

        // Create navigation menu
        this._navigationMenu = new NavigationQuickPickMenu(
            config.excludePatterns, this._openFileInEditor
        );

        // Call active editor changed manually first time
        this._onNewTextEditor(vscode.window.activeTextEditor);
    }

    _showSameLevelFilesQuickMenu(dir) {
        log.info('Showing quick open menu for ' + dir);

        // show directory in menu
        this._navigationMenu.showDir(dir);
    }

    _openFileInEditor(fileName) {
        log.info('Opening file in current editor ' + fileName)

        // open document at current view column and show it
        vscode.workspace.openTextDocument(fileName).then(
            doc => vscode.window.showTextDocument(doc, vscode.ViewColumn.Active)
        );
    }

    _onNewTextEditor(textEditor) {
        // skip if there is no active editor or no document or it's untitled
        if (!textEditor || !textEditor.document || textEditor.document.isUntitled) {
            this._statusBarItem.setItems([]);
            return;
        }

        let document = textEditor.document;

        // log event
        log.info('new document opened ' + document.fileName);

        // set current statusbar item text and show it
        this._statusBarItem.setItems(
            createBreadCrumbItemsFromFile(
                document.uri, this._showSameLevelFilesQuickMenu.bind(this)
            )
        );
        this._statusBarItem.show();
    }
}

// There is no static attributes *facepalm.jpg*
// Aggregated list of needful commands
StatusBarBreadCrumbExtension.COMMAND_SHOW_SAME_LEVEL_FILES_FOR_GIVEN = 'statusBarBreadcrumb.showSameLevelFilesForGiven';
StatusBarBreadCrumbExtension.COMMANDS_AGGREGATED = [
    [
        StatusBarBreadCrumbExtension.COMMAND_SHOW_SAME_LEVEL_FILES_FOR_GIVEN,
        StatusBarBreadCrumbExtension.prototype._showSameLevelFilesQuickMenu
    ]
];


// extension activate method
export function activate(context) {
    log.info('extension ' + context.workspaceState._id + ' has been initialized');

    // Create and activate extension instance which is disposable, so deactivate isn't needed
    let this_extension = new StatusBarBreadCrumbExtension();
    this_extension.activate(context);
    // Sub for dispose
    context.subscriptions.push(this_extension);
}

// deactivate method
export function deactivate() {

}
