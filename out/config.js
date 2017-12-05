'use strict';

Object.defineProperty(exports, "__esModule", {
    value: true
});
exports.ExtensionConfig = undefined;

var _slicedToArray = function () { function sliceIterator(arr, i) { var _arr = []; var _n = true; var _d = false; var _e = undefined; try { for (var _i = arr[Symbol.iterator](), _s; !(_n = (_s = _i.next()).done); _n = true) { _arr.push(_s.value); if (i && _arr.length === i) break; } } catch (err) { _d = true; _e = err; } finally { try { if (!_n && _i["return"]) _i["return"](); } finally { if (_d) throw _e; } } return _arr; } return function (arr, i) { if (Array.isArray(arr)) { return arr; } else if (Symbol.iterator in Object(arr)) { return sliceIterator(arr, i); } else { throw new TypeError("Invalid attempt to destructure non-iterable instance"); } }; }();

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _minimatch = require('minimatch');

var minimatch = _interopRequireWildcard(_minimatch);

function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } else { var newObj = {}; if (obj != null) { for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) newObj[key] = obj[key]; } } newObj.default = obj; return newObj; } }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

/**
 * Aggregate and provide sensitive configuration values
 */
var ExtensionConfig = exports.ExtensionConfig = function () {
    function ExtensionConfig(configuration) {
        _classCallCheck(this, ExtensionConfig);

        this._sourceConfiguration = configuration;
    }

    /**
     * List of globs patterns which taken from two sources:
     *  - Default IDE patterns `files.exclude`
     *  - Extension patterns `'statusBarBreadcrumb.additionalFilesExclude`
     */


    _createClass(ExtensionConfig, [{
        key: 'excludePatterns',
        get: function get() {
            // get configuration values related
            var filesExclude = this._sourceConfiguration.get('files.exclude');
            var additionalFilesExclude = this._sourceConfiguration.get('statusBarBreadcrumb.additionalFilesExclude');

            //
            var patterns = void 0;
            if (!filesExclude) patterns = [];else patterns = filesExclude;

            if (additionalFilesExclude) patterns = Object.assign(patterns, additionalFilesExclude);

            return Object.entries(patterns).filter(function (_ref) {
                var _ref2 = _slicedToArray(_ref, 2),
                    pattern = _ref2[0],
                    enable = _ref2[1];

                return enable;
            }).map(function (_ref3) {
                var _ref4 = _slicedToArray(_ref3, 2),
                    pattern = _ref4[0],
                    _ = _ref4[1];

                return minimatch.makeRe(pattern);
            });
        }
    }]);

    return ExtensionConfig;
}();
//# sourceMappingURL=config.js.map