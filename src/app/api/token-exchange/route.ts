import { auth } from "@/auth";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    
    if (!session?.accessToken) {
      return NextResponse.json({ error: 'No access token found' }, { status: 401 });
    }

    const { scope, audience } = await request.json();

    const body = new URLSearchParams({
      'grant_type': 'urn:ietf:params:oauth:grant-type:token-exchange',
      'subject_token': session.accessToken,
      'requested_token_type': 'urn:ietf:params:oauth:token-type:access_token',
      'subject_token_type': 'urn:ietf:params:oauth:token-type:access_token',
    });

    if (scope) {
      body.append('scope', scope);
    }

    if (audience) {
      body.append('audience', audience);
    }

    const tokenExchange = await fetch(process.env.KEYCLOAK_URL + '/protocol/openid-connect/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${Buffer.from(`${process.env.KEYCLOAK_CLIENT_ID}:${process.env.KEYCLOAK_CLIENT_SECRET}`).toString('base64')}`,
      },
      body: body.toString()
    });

    if (tokenExchange.ok) {
      const result = await tokenExchange.json();
      return NextResponse.json(result);
    } else {
      const errorText = await tokenExchange.text();
      return NextResponse.json({ 
        error: `HTTP ${tokenExchange.status}: ${tokenExchange.statusText}`,
        details: errorText 
      }, { status: tokenExchange.status });
    }
  } catch (error) {
    console.error('Token exchange error:', error);
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }, { status: 500 });
  }
}