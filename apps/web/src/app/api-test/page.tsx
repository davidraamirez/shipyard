"use client";

import { useEffect, useState } from "react";
import { apiRequest } from "@/lib/api";

interface ApiStatus {
  status: string;
  database: string;
  users: number;
}

export default function ApiTestPage() {
  const [data, setData] = useState<ApiStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function checkApi() {
      try {
        const result = await apiRequest<ApiStatus>("/");
        setData(result);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Error desconocido",
        );
      } finally {
        setLoading(false);
      }
    }

    void checkApi();
  }, []);

  return (
    <main className="min-h-screen bg-slate-950 p-8 text-slate-100">
      <div className="mx-auto max-w-2xl">
        <h1 className="text-2xl font-bold">Shipyard API Test</h1>
        <p className="mt-2 text-slate-400">
          Comprobando la comunicación con el backend.
        </p>

        <div className="mt-8 rounded-xl border border-slate-800 bg-slate-900 p-6">
          {loading && <p>Conectando con la API...</p>}

          {error && (
            <p className="text-red-400">
              No se pudo conectar: {error}
            </p>
          )}

          {data && (
            <div className="space-y-3">
              <p className="text-emerald-400">
                Conexión con la API correcta
              </p>
              <p>
                Estado: <strong>{data.status}</strong>
              </p>
              <p>
                Base de datos: <strong>{data.database}</strong>
              </p>
              <p>
                Usuarios: <strong>{data.users}</strong>
              </p>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}