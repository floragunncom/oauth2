const hapiAuthCookie = require('hapi-auth-cookie');
const Boom = require('boom');
const Bell = require('bell');

const esRequestInterceptor = require('./server/es_request_interceptor');

module.exports = function (kibana) {
  return new kibana.Plugin({
    require: ['kibana', 'elasticsearch'],

    config(Joi) {
      return Joi.object({
        enabled: Joi.boolean().default(true),
        cookieName: Joi.string().default('sid'),
        encryptionKey: Joi.string(),
        sessionTimeout: Joi.number().default(30 * 60 * 1000),
        provider: Joi.string(),
        providerId: Joi.string(),
        providerSecret: Joi.string(),
        allowedIndices: Joi.array().items(Joi.string()).single()
      }).default()
    },

    uiExports: {
      chromeNavControls: ['plugins/oauth2/logout_button']
    },

    init: function (server, options) {
      const config = server.config();
      if (config.get('oauth2.encryptionKey') == null) throw new Error('oauth2.encryptionKey is required in kibana.yml.');
      if (config.get('oauth2.provider') == null || config.get('oauth2.providerId') == null || config.get('oauth2.providerSecret') == null) {
        throw new Error('Please set oauth2.provider, oauth2.providerId, and oauth2.providerSecret in kibana.yml.');
      }
      if (config.get('server.ssl.key') == null || config.get('server.ssl.cert') == null) {
        throw new Error('HTTPS is required. Please set server.ssl.key and server.ssl.cert in kibana.yml.');
      }

      server.register([hapiAuthCookie, Bell], function (error) {
        server.auth.strategy('session', 'cookie', 'required', {
            cookie: config.get('oauth2.cookieName'),
            password: config.get('oauth2.encryptionKey'),
            ttl: config.get('oauth2.sessionTimeout'),
            path: config.get('server.basePath') + '/',
            clearInvalid: true,
            keepAlive: true,
            redirectTo: `${config.get('server.basePath')}/login`
        });

        server.auth.strategy(config.get('oauth2.provider'), 'bell', {
          provider: config.get('oauth2.provider'),
          password: config.get('oauth2.encryptionKey'),
          clientId: config.get('oauth2.providerId'),
          clientSecret: config.get('oauth2.providerSecret')
        });
      });

      server.route({
        method: ['GET', 'POST'],
        path: '/login',
        config: {
          auth: config.get('oauth2.provider')
        },
        handler: function (request, reply) {
          if (!request.auth.isAuthenticated) {
            return reply(Boom.unauthorized('Authentication failed: ' + request.auth.error.message));
          }

          request.auth.session.set(request.auth.credentials);

          return reply.redirect('./');
        }
      });

      server.route({
        method: 'GET',
        path: '/logout',
        handler: function (request, reply) {
          request.auth.session.clear();
          reply.redirect('./');
        }
      });

      esRequestInterceptor(server);
    }
  });
};
