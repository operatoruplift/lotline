import { getAssetDetails } from '@/lib/server/tokens';
import { noStore, httpStatus } from '@/lib/server/requests';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const keys = [...params.keys()];
  if (keys.length !== 2 || params.getAll('network').length !== 1 || params.getAll('mint').length !== 1) {
    return Response.json({ state: 'invalid-input', network: 'solana', mint: '', source: 'tokens.xyz', details: null, message: 'Provide one network and one verified mint.' }, { status: 400, headers: noStore });
  }
  const response = await getAssetDetails(params.get('network') ?? '', params.get('mint') ?? '');
  return Response.json(response, { status: httpStatus(response.state), headers: noStore });
}
