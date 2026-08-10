const requireRole = (...allowedRoles) => {
  const normalizedRoles = allowedRoles.flat().map((role) => String(role).toLowerCase());
  return (req, res, next) => {
    const role = String(req.user && req.user.role ? req.user.role : '').toLowerCase();
    if (!normalizedRoles.includes(role)) {
      return res.status(403).json({
        error: 'This feature is not available for your account role.',
        code: 'ROLE_FORBIDDEN',
      });
    }
    return next();
  };
};

module.exports = requireRole;
