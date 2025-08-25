const API_URL = 'http://localhost:3030';

export type TempKeyResponse = { token: string };

export const requestTempAPIKey = async (): Promise<string> => {
  const res = await fetch(`${API_URL}/temp-api-key`);
  if (!res.ok) {
    throw new Error(`Failed to fetch a temp API key: ${res.status} ${res.statusText}`);
  }
  const data = (await res.json()) as Partial<TempKeyResponse>;
  const token = data?.token;
  if (!token) {
    throw new Error('Temp API key response missing token');
  }
  console.log('token: ', token);
  return token;
};
