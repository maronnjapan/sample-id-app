
import express from "express";
import { Request, Response } from "express";

const app = express();
const port = process.env.CLIENT_PORT || 8000;

app.use(express.json());

app.get("/verify/:token", (req: Request, res: Response) => {
    const query = req.query;

    res.send(`
    <html>
      <body>
        <h1>Verification Successful</h1>
        <p>Your access has been verified. You can now close this window.</p>
        <p>The calculation result will be returned to Claude.</p>
        <p>Expression: ${query.expression}</p>
      </body>
    </html>
  `);
});


export { app, port }