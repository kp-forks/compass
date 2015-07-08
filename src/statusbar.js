var AmpersandView = require('ampersand-view');
var $ = require('jquery');

var StatusbarView = AmpersandView.extend({
  props: {
    width: {
      type: 'number',
      default: 0
    },
    message: {
      type: 'string',
      default: 'Analyzing documents...'
    }
  },
  bindings: {
    width: [
      {
        hook: 'bar',
        type: function(el, value) {
          if (!this.el) return;
          if (value === 0) {
            document.querySelector('.progress').style.height = '0px';
          } else {
            document.querySelector('.progress').style.height = '4px';
            document.querySelector('.progress-bar').style.width = value + '%';
          }
        }
      },
      {
        type: 'booleanClass',
        yes: 'visible',
        no: 'hidden'
      }
    ]
  },
  watch: function(view, collection) {
    view.listenTo(collection, 'sync', this.hide.bind(this));
    view.listenTo(collection, 'request', this.show.bind(this));
    return this;
  },
  unwatch: function(view, collection) {
    view.stopListening(collection, 'sync', this.hide.bind(this));
    view.stopListening(collection, 'request', this.show.bind(this));
    return this;
  },
  show: function() {
    this.$el = $('#statusbar');
    this.el = this.$el.get(0);
    this.$message = $('ul.message-background');
    this.$message_text = this.$message.find('[data-hook="statusbar-message"]');
    this.$message_text.text(this.message);
    this.$message.removeClass('hidden');
    this.width = 100;
  },
  hide: function() {
    if (this.$message) {
      this.$message.addClass('hidden');
      setTimeout(function() {
        this.width = 0;
      }.bind(this), 200);
    } else {
      this.width = 0;
    }
  },
  render: function() {
    this.show();
  }
});

module.exports = StatusbarView;
