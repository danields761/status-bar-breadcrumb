import * as minimatch from "minimatch";
import * as vscode from "vscode";

/**
 * Aggregate and provide sensitive configuration values
 */
export class ExtensionConfig {
    constructor() {
        this._excludePatternsCallback = null;
        this._patternsCached = null;
        this._filesConfig = null;
        this._extConfig = null;

        vscode.workspace.onDidChangeConfiguration(this._configChanged.bind(this));
        // prepares config
        this._configChanged();
    }

    /**
     * Subscribe callback on configuration change event
     * @param {*} callback
     */
    onExcludePatternsChanged(callback) {
        this._excludePatternsCallback = callback;
    }

    /**
     * List of globs patterns which taken from two sources:
     *  - Default IDE patterns `files.exclude`
     *  - Extension patterns `'statusBarBreadcrumb.additionalFilesExclude`
     */
    get excludePatterns() {
        if (this._patternsCached === null) {
            this._patternsCached = this._calcPatterns();
        }
        return this._patternsCached;
    }

    _configChanged() {
        this._filesConfig = vscode.workspace.getConfiguration("files", null);
        this._extConfig = vscode.workspace.getConfiguration("statusBarBreadcrumb", null);
        this._configChanged = null;

        if (this._excludePatternsCallback !== null) {
            this._excludePatternsCallback();
        }
    }

    _calcPatterns() {
        // get configuration values related
        let filesExclude = this._filesConfig.get('exclude');
        let additionalFilesExclude = this._extConfig.get('additionalFilesExclude');

        //
        let patterns;
        if (!filesExclude) {
            patterns = [];
        } else {
            patterns = filesExclude;
        }

        if (additionalFilesExclude) {
            patterns = Object.assign(patterns, additionalFilesExclude);
        }

        return Object.entries(patterns).filter(
            ([pattern, enable]) => enable
        ).map(
            ([pattern, _]) => minimatch.makeRe(pattern)
        );
    }
}
