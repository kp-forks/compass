var $ = window.jQuery = window.$ = require('jquery');

require('bootstrap/js/dropdown');
require('bootstrap/js/collapse');
require('bootstrap/js/tooltip');

module.exports = {
  tooltip: function(opts) {
    return $(this.el).tooltip(opts);
  }
};
