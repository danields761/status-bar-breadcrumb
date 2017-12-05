import * as minimatch from "minimatch";


/**
 * Aggregate and provide sensitive configuration values
 */
export class ExtensionConfig {
    constructor(configuration) {
        this._sourceConfiguration = configuration;
    }

    /**
     * List of globs patterns which taken from two sources:
     *  - Default IDE patterns `files.exclude`
     *  - Extension patterns `'statusBarBreadcrumb.additionalFilesExclude`
     */
    get excludePatterns() {
        // get configuration values related
        let filesExclude = this._sourceConfiguration.get('files.exclude');
        let additionalFilesExclude = this._sourceConfiguration.get(
            'statusBarBreadcrumb.additionalFilesExclude'
        );

        //
        let patterns;
        if (!filesExclude)
            patterns = [];
        else
            patterns = filesExclude;

        if (additionalFilesExclude)
            patterns = Object.assign(patterns, additionalFilesExclude);

        return Object.entries(patterns).filter(
            ([pattern, enable]) => enable
        ).map(
            ([pattern, _]) => minimatch.makeRe(pattern)
        );
    }
}
