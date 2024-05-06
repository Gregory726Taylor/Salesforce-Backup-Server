// middleware.js
function checkAuthentication(req, res, next) {
    if (!req.user) {
        res.redirect('/login');
    } else {
        next();
    }
}

function checkAdmin(req, res, next) {
    if (req.user && req.user.isAdmin) {
        console.log("User is an admin");
        next();
    } else {
        res.status(403).send("Access denied. Admins only.");
    }
}

module.exports = {
    checkAuthentication,
    checkAdmin
};