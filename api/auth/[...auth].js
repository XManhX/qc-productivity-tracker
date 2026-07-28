// api/auth/[...auth].js
export default function handler(req, res) {
    res.status(200).json({ message: 'Hello from auth', url: req.url });
}