// api/auth/[...auth].js
export default function handler(req, res) {
    console.log('Auth route hit', req.url);
    res.status(200).json({
        message: 'Auth route is working',
        url: req.url,
        query: req.query,
    });
}