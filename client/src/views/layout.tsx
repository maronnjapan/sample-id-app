import type { Child } from "hono/jsx";

export function Layout({ title, children }: { title: string; children: Child }) {
  return (
    <html lang="ja">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{title}</title>
        <style>{`
          body { font-family: -apple-system, sans-serif; background: #f5f5f5; margin: 0; padding: 20px; }
          .container { max-width: 800px; margin: 0 auto; background: #fff; padding: 30px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
          h1 { color: #333; border-bottom: 2px solid #4CAF50; padding-bottom: 10px; }
          h2 { color: #555; margin-top: 24px; }
          pre { background: #f8f8f8; padding: 16px; border-radius: 4px; overflow-x: auto; border: 1px solid #e0e0e0; font-size: 13px; line-height: 1.5; }
          .btn { display: inline-block; background: #4CAF50; color: #fff; padding: 12px 24px; text-decoration: none; border-radius: 4px; margin-top: 16px; }
          .btn:hover { background: #45a049; }
          table { border-collapse: collapse; width: 100%; }
          th, td { text-align: left; padding: 8px 12px; border-bottom: 1px solid #e0e0e0; }
          th { color: #666; width: 160px; }
        `}</style>
      </head>
      <body>
        <div class="container">{children}</div>
      </body>
    </html>
  );
}
