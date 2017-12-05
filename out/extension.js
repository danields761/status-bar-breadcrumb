'use strict';

// The module 'vscode' contains the VS Code extensibility API

Object.defineProperty(exports, "__esModule", {
    value: true
});

var _slicedToArray = function () { function sliceIterator(arr, i) { var _arr = []; var _n = true; var _d = false; var _e = undefined; try { for (var _i = arr[Symbol.iterator](), _s; !(_n = (_s = _i.next()).done); _n = true) { _arr.push(_s.value); if (i && _arr.length === i) break; } } catch (err) { _d = true; _e = err; } finally { try { if (!_n && _i["return"]) _i["return"](); } finally { if (_d) throw _e; } } return _arr; } return function (arr, i) { if (Array.isArray(arr)) { return arr; } else if (Symbol.iterator in Object(arr)) { return sliceIterator(arr, i); } else { throw new TypeError("Invalid attempt to destructure non-iterable instance"); } }; }();

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

exports.activate = activate;
exports.deactivate = deactivate;

var _path = require("path");

var path = _interopRequireWildcard(_path);

var _os = require("os");

var os = _interopRequireWildcard(_os);

var _fs = require("fs");

var fs = _interopRequireWildcard(_fs);

var _minimatch = require("minimatch");

var minimatch = _interopRequireWildcard(_minimatch);

var _vscode = require("vscode");

var vscode = _interopRequireWildcard(_vscode);

var _config = require("./config");

function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } else { var newObj = {}; if (obj != null) { for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) newObj[key] = obj[key]; } } newObj.default = obj; return newObj; } }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

var log = console;

// utils
function _isDirectory(file) {
    var stat = fs.statSync(file); // probably slow
    return stat.isDirectory();
}

function createBreadCrumbItemsFromFile(fileUri, callback) {
    // this wall of code full of shit but do exactly what it should
    // no power to refactor it
    var fileName = path.normalize(fileUri.fsPath);
    var selectedPath = fileName;
    var homeDir = path.normalize(os.homedir());
    var workspaceDirs = vscode.workspace.workspaceFolders;
    var homeFound = false;
    var workspaceFound = false;
    var selectedWorkspaceName = null;
    var selectedWorkspaceAbs = null;

    // find intersections with such root dirs as home and workspace
    homeFound = fileName.includes(fileName);
    if (homeFound) {
        selectedPath = path.relative(homeDir, fileName);
    }
    var ws = vscode.workspace.getWorkspaceFolder(fileUri);
    if (ws) {
        var wsd = ws.uri.fsPath;
        selectedPath = path.relative(wsd, fileName);
        workspaceFound = true;
        selectedWorkspaceName = ws.name;
        selectedWorkspaceAbs = wsd;
    }

    // create list of breadcrumb items
    var breadcrumbItems = [];
    var parsedFileName = path.parse(selectedPath);
    var aggregatedPath = null;

    // push root found node
    if (workspaceFound) {
        breadcrumbItems.push(["$(file-submodule) " + selectedWorkspaceName, 'Workspace root', callback, selectedWorkspaceAbs]);
        aggregatedPath = selectedWorkspaceAbs;
    } else if (homeFound) {
        breadcrumbItems.push(["$(home)", 'Home', callback, homeDir]);
        aggregatedPath = homeDir;
    } else {
        breadcrumbItems.push([" / ", 'Project root', callback, parsedFileName.root]);
        aggregatedPath = parsedFileName.root;
    }

    // push itermediate parts
    var _iteratorNormalCompletion = true;
    var _didIteratorError = false;
    var _iteratorError = undefined;

    try {
        for (var _iterator = parsedFileName.dir.split(path.sep).filter(function (a) {
            return !!a;
        })[Symbol.iterator](), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true) {
            var part = _step.value;

            aggregatedPath = path.join(aggregatedPath, part);
            breadcrumbItems.push(["$(chevron-right)\t" + part, "Folder " + part, callback, aggregatedPath]);
        }
    } catch (err) {
        _didIteratorError = true;
        _iteratorError = err;
    } finally {
        try {
            if (!_iteratorNormalCompletion && _iterator.return) {
                _iterator.return();
            }
        } finally {
            if (_didIteratorError) {
                throw _iteratorError;
            }
        }
    }

    breadcrumbItems.push(["$(chevron-right)\t" + parsedFileName.base, 'Current file', function () {}, path.join(aggregatedPath, parsedFileName.base)]);

    return breadcrumbItems.reverse();
}

/**
 * Quick-pick navigation menu
 */

var NavigationQuickPickMenu = function (_Disposable) {
    _inherits(NavigationQuickPickMenu, _Disposable);

    /**
     * Create menu with callbacks
     * @param {*} excludePatterns list of regexps to preform excluding
     * @param {*} fileSelectedCallback call in file selected using menu
     * @param {*} dirSelectedCallback if not set will be called recursively
     */
    function NavigationQuickPickMenu(excludePatterns, fileSelectedCallback, dirSelectedCallback) {
        _classCallCheck(this, NavigationQuickPickMenu);

        var _this = _possibleConstructorReturn(this, (NavigationQuickPickMenu.__proto__ || Object.getPrototypeOf(NavigationQuickPickMenu)).call(this));

        _this._fileCallback = fileSelectedCallback;
        _this._dirCallback = dirSelectedCallback;
        _this._excludePatterns = excludePatterns;
        _this._currentCancellationToken = null;
        if (dirSelectedCallback == undefined || dirSelectedCallback === null) _this._dirCallback = function (abs, name) {
            return _this.showDir(abs);
        };
        return _this;
    }

    /**
     * Create menu for directory
     * @param {*} dir given directory
     */


    _createClass(NavigationQuickPickMenu, [{
        key: "showDir",
        value: function showDir(dir) {
            var _this2 = this;

            // list current dir files splitting them into files and directories
            var dirs = [];
            var files = [];
            fs.readdirSync(dir).map(function (f) {
                return path.normalize(path.join(dir, f));
            }).filter(function (f) {
                return !_this2._excludePatterns.some(function (p) {
                    return p.test(f);
                });
            }).forEach(function (absolute) {
                var name = path.basename(absolute);
                if (_isDirectory(absolute)) dirs.push({ label: "$(file-directory) " + name, detail: absolute });else files.push({ label: name, detail: absolute });
            });
            // show menu items, on then call appropriate callback
            this._currentCancellationToken = new vscode.CancellationTokenSource();
            vscode.window.showQuickPick([{ label: '..', detail: path.join(dir, '..') }].concat(dirs.sort().concat(files.sort()))).then(function (selected) {
                _this2._currentCancellationToken = null;
                if (selected == undefined) return;

                if (_isDirectory(selected.detail)) _this2._dirCallback(selected.detail, selected.name);else _this2._fileCallback(selected.detail, selected.name);
            });
        }
    }, {
        key: "dispose",
        value: function dispose() {
            if (this._currentCancellationToken) {
                this._currentCancellationToken.dispose();
                this._currentCancellationToken = null;
            }
        }
    }]);

    return NavigationQuickPickMenu;
}(_vscode.Disposable);

/**
 * Class is untended to group and control multiple status-bar items at once
 *  providing multiple control methods like
 *  @see [show](#MultipleStatusBarItem.show) and @see [hide](#MultipleStatusBarItem.hide)
 */


var MultipleStatusBarItem = function (_Disposable2) {
    _inherits(MultipleStatusBarItem, _Disposable2);

    function MultipleStatusBarItem(align) {
        _classCallCheck(this, MultipleStatusBarItem);

        var _this3 = _possibleConstructorReturn(this, (MultipleStatusBarItem.__proto__ || Object.getPrototypeOf(MultipleStatusBarItem)).call(this));

        _this3._basePriority = -50;
        _this3._subItems = [];
        _this3._subItemCommandHandles = [];
        _this3._sbAlign = align || vscode.StatusBarAlignment.Left;
        return _this3;
    }

    /**
     * Set group of status-bar items strictly aligned together
     * @param items
     * list of tuples in form (item_label, callable, callable_args)
     */


    _createClass(MultipleStatusBarItem, [{
        key: "setItems",
        value: function setItems(items) {
            var _this4 = this;

            this.dispose();

            var num = 0;
            var _iteratorNormalCompletion2 = true;
            var _didIteratorError2 = false;
            var _iteratorError2 = undefined;

            try {
                var _loop = function _loop() {
                    var _step2$value = _slicedToArray(_step2.value, 4),
                        text = _step2$value[0],
                        hint = _step2$value[1],
                        callable = _step2$value[2],
                        args = _step2$value[3];

                    var r_item = vscode.window.createStatusBarItem(_this4._sbAlign, _this4._basePriority + num++);

                    var command = 'extension._internalCommand' + num;
                    var command_handle = vscode.commands.registerCommand(command, function () {
                        return callable(args);
                    });

                    r_item.text = text;
                    r_item.command = command;
                    r_item.tooltip = hint;

                    _this4._subItems.push(r_item);
                    _this4._subItemCommandHandles.push(command_handle);
                };

                for (var _iterator2 = items[Symbol.iterator](), _step2; !(_iteratorNormalCompletion2 = (_step2 = _iterator2.next()).done); _iteratorNormalCompletion2 = true) {
                    _loop();
                }
            } catch (err) {
                _didIteratorError2 = true;
                _iteratorError2 = err;
            } finally {
                try {
                    if (!_iteratorNormalCompletion2 && _iterator2.return) {
                        _iterator2.return();
                    }
                } finally {
                    if (_didIteratorError2) {
                        throw _iteratorError2;
                    }
                }
            }
        }

        /**
         * Show elements
         */

    }, {
        key: "show",
        value: function show() {
            var _iteratorNormalCompletion3 = true;
            var _didIteratorError3 = false;
            var _iteratorError3 = undefined;

            try {
                for (var _iterator3 = this._subItems[Symbol.iterator](), _step3; !(_iteratorNormalCompletion3 = (_step3 = _iterator3.next()).done); _iteratorNormalCompletion3 = true) {
                    var item = _step3.value;

                    item.show();
                }
            } catch (err) {
                _didIteratorError3 = true;
                _iteratorError3 = err;
            } finally {
                try {
                    if (!_iteratorNormalCompletion3 && _iterator3.return) {
                        _iterator3.return();
                    }
                } finally {
                    if (_didIteratorError3) {
                        throw _iteratorError3;
                    }
                }
            }
        }

        /**
         * Hide elements
         */

    }, {
        key: "hide",
        value: function hide() {
            var _iteratorNormalCompletion4 = true;
            var _didIteratorError4 = false;
            var _iteratorError4 = undefined;

            try {
                for (var _iterator4 = this._subItems[Symbol.iterator](), _step4; !(_iteratorNormalCompletion4 = (_step4 = _iterator4.next()).done); _iteratorNormalCompletion4 = true) {
                    var item = _step4.value;

                    item.hide();
                }
            } catch (err) {
                _didIteratorError4 = true;
                _iteratorError4 = err;
            } finally {
                try {
                    if (!_iteratorNormalCompletion4 && _iterator4.return) {
                        _iterator4.return();
                    }
                } finally {
                    if (_didIteratorError4) {
                        throw _iteratorError4;
                    }
                }
            }
        }
    }, {
        key: "dispose",
        value: function dispose() {
            var _iteratorNormalCompletion5 = true;
            var _didIteratorError5 = false;
            var _iteratorError5 = undefined;

            try {
                for (var _iterator5 = this._subItems[Symbol.iterator](), _step5; !(_iteratorNormalCompletion5 = (_step5 = _iterator5.next()).done); _iteratorNormalCompletion5 = true) {
                    var item = _step5.value;

                    item.dispose();
                }
            } catch (err) {
                _didIteratorError5 = true;
                _iteratorError5 = err;
            } finally {
                try {
                    if (!_iteratorNormalCompletion5 && _iterator5.return) {
                        _iterator5.return();
                    }
                } finally {
                    if (_didIteratorError5) {
                        throw _iteratorError5;
                    }
                }
            }

            var _iteratorNormalCompletion6 = true;
            var _didIteratorError6 = false;
            var _iteratorError6 = undefined;

            try {
                for (var _iterator6 = this._subItemCommandHandles[Symbol.iterator](), _step6; !(_iteratorNormalCompletion6 = (_step6 = _iterator6.next()).done); _iteratorNormalCompletion6 = true) {
                    var handle = _step6.value;

                    handle.dispose();
                }
            } catch (err) {
                _didIteratorError6 = true;
                _iteratorError6 = err;
            } finally {
                try {
                    if (!_iteratorNormalCompletion6 && _iterator6.return) {
                        _iterator6.return();
                    }
                } finally {
                    if (_didIteratorError6) {
                        throw _iteratorError6;
                    }
                }
            }
        }
    }]);

    return MultipleStatusBarItem;
}(_vscode.Disposable);

/**
 * Extension entry point with global state
 */


var StatusBarBreadCrumbExtension = function (_Disposable3) {
    _inherits(StatusBarBreadCrumbExtension, _Disposable3);

    function StatusBarBreadCrumbExtension() {
        _classCallCheck(this, StatusBarBreadCrumbExtension);

        var _this5 = _possibleConstructorReturn(this, (StatusBarBreadCrumbExtension.__proto__ || Object.getPrototypeOf(StatusBarBreadCrumbExtension)).call(this));

        _this5._statusBarItem = null;
        _this5._navigationMenu = null;
        _this5._config = null;
        return _this5;
    }

    /**
     * Same as `extension.activate`
     * @param {*} context extension context
     */


    _createClass(StatusBarBreadCrumbExtension, [{
        key: "activate",
        value: function activate(context) {
            // Register commands
            var _iteratorNormalCompletion7 = true;
            var _didIteratorError7 = false;
            var _iteratorError7 = undefined;

            try {
                for (var _iterator7 = StatusBarBreadCrumbExtension.COMMANDS_AGGREGATED[Symbol.iterator](), _step7; !(_iteratorNormalCompletion7 = (_step7 = _iterator7.next()).done); _iteratorNormalCompletion7 = true) {
                    var _step7$value = _slicedToArray(_step7.value, 2),
                        command_name = _step7$value[0],
                        command_func = _step7$value[1];

                    vscode.commands.registerCommand(command_name, command_func.bind(this));
                }

                // reload on config change
            } catch (err) {
                _didIteratorError7 = true;
                _iteratorError7 = err;
            } finally {
                try {
                    if (!_iteratorNormalCompletion7 && _iterator7.return) {
                        _iterator7.return();
                    }
                } finally {
                    if (_didIteratorError7) {
                        throw _iteratorError7;
                    }
                }
            }

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

    }, {
        key: "reload",
        value: function reload() {
            log.debug('Reloading configuration ...');

            // dispose before recreating
            this._navigationMenu.dispose();

            // initialize again
            this._initialize();
        }
    }, {
        key: "dispose",
        value: function dispose() {
            this._statusBarItem.dispose();
            if (this._navigationMenu) this._navigationMenu.dispose();
        }

        // private

    }, {
        key: "_initialize",
        value: function _initialize() {
            // Get configuration
            var config = new _config.ExtensionConfig(vscode.workspace.getConfiguration());

            // Create navigation menu
            this._navigationMenu = new NavigationQuickPickMenu(config.excludePatterns, this._openFileInEditor);

            // Call active editor changed manually first time
            this._onNewTextEditor(vscode.window.activeTextEditor);
        }
    }, {
        key: "_showSameLevelFilesQuickMenu",
        value: function _showSameLevelFilesQuickMenu(dir) {
            log.info('Showing quick open menu for ' + dir);

            // show directory in menu
            this._navigationMenu.showDir(dir);
        }
    }, {
        key: "_openFileInEditor",
        value: function _openFileInEditor(fileName) {
            log.info('Opening file in current editor ' + fileName);

            // open document at current view column and show it
            vscode.workspace.openTextDocument(fileName).then(function (doc) {
                return vscode.window.showTextDocument(doc, vscode.ViewColumn.Active);
            });
        }
    }, {
        key: "_onNewTextEditor",
        value: function _onNewTextEditor(textEditor) {
            // skip if there is no active editor or no document or it's untitled
            if (!textEditor || !textEditor.document || textEditor.document.isUntitled) {
                this._statusBarItem.setItems([]);
                return;
            }

            var document = textEditor.document;

            // log event
            log.info('new document opened ' + document.fileName);

            // set current statusbar item text and show it
            this._statusBarItem.setItems(createBreadCrumbItemsFromFile(document.uri, this._showSameLevelFilesQuickMenu.bind(this)));
            this._statusBarItem.show();
        }
    }]);

    return StatusBarBreadCrumbExtension;
}(_vscode.Disposable);

// There is no static attributes *facepalm.jpg*
// Aggregated list of needful commands


StatusBarBreadCrumbExtension.COMMAND_SHOW_SAME_LEVEL_FILES_FOR_GIVEN = 'statusBarBreadcrumb.showSameLevelFilesForGiven';
StatusBarBreadCrumbExtension.COMMANDS_AGGREGATED = [[StatusBarBreadCrumbExtension.COMMAND_SHOW_SAME_LEVEL_FILES_FOR_GIVEN, StatusBarBreadCrumbExtension.prototype._showSameLevelFilesQuickMenu]];

// extension activate method
function activate(context) {
    log.info('extension ' + context.workspaceState._id + ' has been initialized');

    // Create and activate extension instance which is disposable, so deactivate isn't needed
    var this_extension = new StatusBarBreadCrumbExtension();
    this_extension.activate(context);
    // Sub for dispose
    context.subscriptions.push(this_extension);
}

// deactivate method
function deactivate() {}
//# sourceMappingURL=extension.js.map