const registerAuthRoutes = require('./auth.routes');
const registerHumancheckRoutes = require('./humancheck.routes');
const registerMaintenanceRoutes = require('./maintenance.routes');
const registerPublicRoutes = require('./public.routes');
const registerAdminRoutes = require('./admin.routes');

function registerRoutes(app, deps) {
  registerMaintenanceRoutes(app, deps);
  registerPublicRoutes(app, deps);
  registerHumancheckRoutes(app, deps);
  registerAuthRoutes(app, deps);
  registerAdminRoutes(app, deps);
}

module.exports = registerRoutes;
