import { NextResponse, type NextRequest } from "next/server";

// APP_PASSWORD を設定すると、すべてのページを合言葉（Basic 認証）で守る。
// 訪問履歴は個人データなので、公開するときは必ず設定する。
export function proxy(request: NextRequest) {
  const password = process.env.APP_PASSWORD;
  if (!password) return NextResponse.next();

  const header = request.headers.get("authorization");
  if (header?.startsWith("Basic ")) {
    const [, given] = atob(header.slice(6)).split(":");
    if (given === password) return NextResponse.next();
  }
  return new NextResponse("合言葉が必要です", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="tabisaki", charset="UTF-8"' },
  });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
