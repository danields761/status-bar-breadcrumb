'use strict';

// The module 'vscode' contains the VS Code extensibility API
import * as path from "path";
import * as os from "os";
import * as fs from "fs";
import * as vscode from "vscode";
import * as minimatch from "minimatch";
import {Disposable} from "vscode";


let log = console;


// utils
function _isDirectory(file) {
    let stat = fs.statSync(file);  // probably slow
    return stat.isDirectory();
}

function createBreadCrumbItemsFromFile(fileName, callback) {
    // this wall of code full of shit but do exactly what it should
    // no power to refactor it
    let selectedPath = fileName;
    let homeDir = os.homedir();
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
    for (let [name, wsd] of workspaceDirs.map(dir => [dir.name, dir.uri.path])) {
        workspaceFound = fileName.includes(wsd);
        if (workspaceFound) {
            selectedPath = path.relative(wsd, fileName);
            workspaceFound = true;
            selectedWorkspaceName = name;
            selectedWorkspaceAbs = wsd;
            break;
        }
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
     * @param {*} fileSelectedCallback 
     * @param {*} dirSelectedCallback if not set will be called recursively
     */
    constructor(excludePatterns, fileSelectedCallback, dirSelectedCallback) {
        super();
        this._fileCallback = fileSelectedCallback;
        this._dirCallback = dirSelectedCallback;
        this._excludePatterns = excludePatterns.map(
            pattern => minimatch.makeRe(pattern)
        );
        this._currentCancellationToken = null;
        if (dirSelectedCallback == undefined || dirSelectedCallback === null)
            this._dirCallback = (abs, name) => this.showDir(abs);
    }

    /**
     * Create menu for directory
     * @param {*} dir 
     */
    showDir(dir) {
        // list current dir files splitting them into files and directories
        let dirs = [];
        let files = [];
        fs.readdirSync(dir).filter(
            f => !this._excludePatterns.some(p => p.test(f))
        ).forEach(
            name => {
                let abs = path.join(dir, name);
                if (_isDirectory(abs))
                    dirs.push({label: `$(file-directory) ${name}`, detail: abs});
                else
                    files.push({label: name, detail: abs});
            }
        )
        // show menu items, on then call appropriate callback
        this._currentCancellationToken = new vscode.CancellationTokenSource();
        vscode.window.showQuickPick(
            dirs.sort().concat(files.sort())
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
    }

    activate(context) {
        // Register commands
        for (let [command_name, command_func] of StatusBarBreadCrumbExtension.COMMANDS_AGGREGATED) {
            vscode.commands.registerCommand(
                command_name, command_func.bind(this)
            );
        }

        // Get configuration
        let configuration = vscode.workspace.getConfiguration('status-bar-breadcrumb');

        // Reload navigation menu on change
        vscode.workspace.onDidChangeConfiguration(
            () => this._navigationMenu.dispose()
        );

        // Create status bar item
        this._statusBarItem = new MultipleStatusBarItem();

        // Create navigation menu
        this._navigationMenu = new NavigationQuickPickMenu(
            configuration.get('filesNavigationMenuExcludePatterns'), this._openFileInEditor
        );
        
        // Subscribe for current document changed events
        let newDocCallback = this._onNewTextEditor;
        vscode.window.onDidChangeActiveTextEditor(newDocCallback.bind(this));

        // Call active editor changed manually first time
        this._onNewTextEditor(vscode.window.activeTextEditor);
    }

    dispose() {
        this._statusBarItem.dispose();
        this._navigationMenu.dispose();
    }

    // private
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
                document.fileName, this._showSameLevelFilesQuickMenu.bind(this)
            )
        );
        this._statusBarItem.show();
    }
}

// There is no static attributes *facepalm.jpg*
// Aggregated list of needful commands
StatusBarBreadCrumbExtension.COMMAND_SHOW_SAME_LEVEL_FILES_FOR_GIVEN = 'status-bar-breadcrumb.showSameLevelFilesForGiven';
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
