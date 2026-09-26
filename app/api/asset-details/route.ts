import { getAssetDetails } from '@/lib/server/tokens';
import { noStore, optionalHttpStatus } from '@/lib/server/requests';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const keys = [...params.keys()];
  if (keys.length !== 2 || params.getAll('network').length !== 1 || params.getAll('mint').length !== 1) {
    return Response.json({ state: 'invalid-input', network: 'solana', mint: '', source: 'tokens.xyz', details: null, message: 'Provide one network and one verified mint.' }, { status: 400, headers: noStore });
  }
  const response = await getAssetDetails(params.get('network') ?? '', params.get('mint') ?? '');
  // Optional Tokens.xyz context that is switched off is a determination the body
  // states in full, and the panel renders it as a normal state, so it answers 200.
  return Response.json(response, { status: optionalHttpStatus(response.state), headers: noStore });
}
