import {
  BufferJSON,
  initAuthCreds,
  proto,
} from '@whiskeysockets/baileys';

export async function useDBAuthState(db: any) {
  const writeData = async (id: string, data: any) => {
    const serialized = JSON.stringify(data, BufferJSON.replacer);
    await db('whatsapp_auth_state')
      .insert({ id, data: serialized })
      .onConflict('id')
      .merge();
  };

  const readData = async (id: string) => {
    const row = await db('whatsapp_auth_state').where('id', id).first();
    if (!row) return null;
    return JSON.parse(row.data, BufferJSON.reviver);
  };

  const removeData = async (id: string) => {
    await db('whatsapp_auth_state').where('id', id).del();
  };

  const credsData = await readData('creds');
  const creds = credsData || initAuthCreds();
  if (!credsData) {
    await writeData('creds', creds);
  }

  return {
    state: {
      creds,
      keys: {
        get: async (type: string, ids: string[]) => {
          const result: Record<string, any> = {};
          for (const id of ids) {
            const value = await readData(`${type}-${id}`);
            if (value) {
              if (type === 'app-state-sync-key') {
                result[id] = proto.Message.AppStateSyncKeyData.fromObject(value);
              } else {
                result[id] = value;
              }
            }
          }
          return result;
        },
        set: async (data: any) => {
          for (const [type, entries] of Object.entries(data) as [string, Record<string, any>][]) {
            for (const [id, value] of Object.entries(entries)) {
              if (value) {
                await writeData(`${type}-${id}`, value);
              } else {
                await removeData(`${type}-${id}`);
              }
            }
          }
        },
      },
    },
    saveCreds: async () => {
      await writeData('creds', creds);
    },
  };
}
