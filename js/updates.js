!function($, B) {

  var fromQueryString = function(qs) {
    var result = {};
    _.each( (qs || '').replace(/^.*?\?/, '').split('&'), function(p) {
      var split = p.split('=');
      if (split.length !== 2) {
        return;
      }
      result[split[0]] = decodeURIComponent(split[1]);
    });
    return result;
  };

  var toQueryString = function(obj) {
    var encoded = [];
    _.each(obj, function(val, name) {
      encoded.push(encodeURIComponent(name) + '=' + encodeURIComponent(val));
    });
    return encoded.join('&');
  };

  var updates = new sp.models.Updates();

  var counts = new (B.Model.extend({
    url: function() {
      return sp.api + '/updates/counts'
    },
    sync: sp.sync
  }))({
    all: 0,
    buffer: 0,
    sent: 0,
    error: 0,
    trash: 0
  });

  updates.on('sync', function() {
    counts.fetch();
  });

  var SubSubSub = B.View.extend({
    initialize: function() {
      this.listenTo(counts, 'sync', this.render);
    },
    render: function() {
      var att = counts.attributes;
      att.selected = updates.params.status || 'all';
      this.$el.html( SubSubSub.template(att) );
      return this;
    }
  });

  var router = new (Backbone.Router.extend({
    routes: {
      '?*:qs': 'updates'
    },
    updates: function() {
      var req = fromQueryString(document.location.search);

      updates.params.set({
        page: 'sp-updates',
        fields: 'profile,error',
        post_status: req.post_status || '',
        order: req.order || 'desc',
        offset: parseInt(req.offset) || 0,
        limit: parseInt(req.limit) || 10
      });

      $(window).scrollTop(0);
    }
  }));

  SubSubSub.template = _.template( $('#sp-subsubsub').html() );

  var TableRow = B.View.extend({
    tagName: 'tr',
    className: 'type-sp_update',
    events: {
      'click [data-action="trash"]': function() {
        this.model.destroy({
          success: function() {
            updates.fetch();
          }
        });        
        return false;
      },
      // 'click [data-action="delete"]': function() {
      //   return false;
      // },
      'click [data-action="restore"]': function() {
        var update = this.model;
        update.restore({
          success: function() {
            updates.fetch();
          }
        }); 
        return false;
      },
      'click [data-action="retry"]': function(e) {
        var update = this.model;
        update.save({ now: true }, {
          success: function() {
            updates.fetch();
          }
        }); 
        return false;
      }
    },
    initialize: function() {
      
    },
    render: function() {
      this.$el.removeClass();
      this.$el.addClass('update update-' + this.model.get('id'));
      this.$el.addClass('status-' + this.model.get('status'));
      this.$el.html( TableRow.template(this.model.attributes) );
      return this;
    }
  });

  TableRow.template = _.template( $('#sp-tablerow-template').html() ); 

  sp.views.UpdatesScreen = B.View.extend({
    events: {
      'click [href^="admin.php?page=sp-updates"]': function(e) {
        router.navigate($(e.currentTarget).attr('href'), { trigger: true });
        return false;
      },
      'click [data-action="next"]': function(e) {
        var params = _.clone(updates.params.attributes);
        params.offset = Math.min(updates.getLastOffset(), parseInt(params.offset) + parseInt(params.limit));
        router.navigate('admin.php?' + toQueryString(params), { trigger: true });
        return false;
      },
      'click [data-action="prev"]': function(e) {
        var params = _.clone(updates.params.attributes);
        params.offset = Math.max(0, parseInt(params.offset - params.limit));
        router.navigate('admin.php?' + toQueryString(params), { trigger: true });
        return false;
      },
      'click [data-action="first"]': function(e) {
        var params = _.clone(updates.params.attributes);
        params.offset = 0;
        router.navigate('admin.php?' + toQueryString(params), { trigger: true });
        return false;
      },
      'click [data-action="last"]': function(e) {
        var params = _.clone(updates.params.attributes);
        params.offset = updates.getLastOffset();
        router.navigate('admin.php?' + toQueryString(params), { trigger: true });
        return false;
      },
      'submit .bulkactions form': function(e) {
        var $form = $(e.currentTarget),
            action = $form.find('select').val();
        // reset the select field
        $form.find('select').val(-1);
        if (action === 'trash') {
          var update = null, done = _.debounce(function() {
            updates.fetch();
          }, 100);
          this.$('.cb-select:checked').each(function(i, el) {
            if (update = updates.get(parseInt($(el).val()))) {
              update.destroy({ success: done });
            }
          });
        } else if (action === 'restore') {
          var update = null, done = _.debounce(function() {
            updates.fetch();
          }, 100);
          this.$('.cb-select:checked').each(function(i, el) {
            if (update = updates.get(parseInt($(el).val()))) {
              update.restore({ success: done });
              updates.remove(update);
            }
          });
        }
        this.$('.cb-select-all').attr('checked', false);
        return false;
      }
    },
    initialize: function(options) {
      this.$table = this.$('table');
      this.$nav = this.$('.tablenav');
      this.filters = new SubSubSub({ el: this.$('.subsubsub') }).render().el;
      this.listenTo(updates, 'add', this.addUpdate);
      this.listenTo(updates, 'remove', this.removeUpdate);
      this.listenTo(updates, 'sync', this.reset);
      
      $(function() {  
        B.history.start({ pushState: true, root: options.root });
      });
    },
    reset: function() {
      var cnt = updates.getCount();
      
      // remove current table rows:
      this.$table.find('tr.update').remove();
      
      // update empty set placeholder:
      this.$table.find('.no-items').toggle(!updates.length);
      
      // update pagination:
      this.$nav.find('.displaying-num').text(cnt + ( cnt != 1 ? ' items' : ' item' ));
      this.$nav.find('.tablenav-pages').toggleClass('one-page', updates.getCount() <= parseInt(updates.params.get('limit')));
      this.$nav.find('.current-page').text(updates.getCurrentPage());
      this.$nav.find('.total-pages').text(updates.getTotalPages());
      this.$nav.find('[data-action="first"], [data-action="prev"]').toggleClass('disabled', updates.hasLess());
      this.$nav.find('[data-action="last"]').toggleClass('disabled', updates.isLastPage());
      this.$nav.find('[data-action="next"]').toggleClass('disabled', updates.hasMore());

      // update bulk actions:
      this.$('option[value="trash"]').attr( 'disabled', updates.params.get('post_status') === 'trash' );
      this.$('option[value="restore"]').attr( 'disabled', updates.params.get('post_status') !== 'trash' );
      
      // redraw table rows:
      updates.each(_.bind(this.addUpdate, this));
    },
    addUpdate: function(update) {
      this.$table.append( new TableRow({ model: update }).render().$el );
    },
    removeUpdate: function(update) {
      this.$table.find('.update-' + update.get('id')).remove();
      this.$table.find('.no-items').toggle(!updates.length);
    }
  });

}(jQuery, Backbone);