// Turns scary database errors into plain-language advice.
function explainDbError(err) {
  const host = process.env.DB_HOST || 'localhost';
  const name = process.env.DB_NAME || 'cinebook';
  switch (err.code) {
    case 'ECONNREFUSED':
      return `Cannot reach MySQL at ${host}:${process.env.DB_PORT || 3306}. Is MySQL running? Start it (XAMPP, MySQL Workbench or Windows Services) and try again.`;
    case 'ENOTFOUND':
      return `Cannot find a MySQL server called "${host}". Check DB_HOST in your .env file.`;
    case 'ER_ACCESS_DENIED_ERROR':
      return 'MySQL refused the username or password. Check DB_USER and DB_PASSWORD in your .env file.';
    case 'ER_BAD_DB_ERROR':
      return `The database "${name}" does not exist yet. Run:  npm run seed`;
    case 'ER_NO_SUCH_TABLE':
    case 'ER_BAD_FIELD_ERROR':
      return `The database "${name}" is empty or out of date. Run:  npm run seed`;
    default:
      return 'Database problem: ' + (err.message || err.code || err);
  }
}

module.exports = { explainDbError };
