import { useRouter } from "next/router";

export default function Home() {
  const router = useRouter();

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-r from-purple-400 via-pink-500 to-yellow-500 text-white py-20 px-6">
      <div className="text-center mb-16">
        <h1 className="text-6xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-teal-200 drop-shadow-md">
          Medical DApp
        </h1>
        <p className="text-xl font-semibold text-gray-100 mt-4">
          Secure, Patient-Centric Medical Records
        </p>
      </div>

      <div className="flex flex-col items-center gap-6 w-full max-w-md">
        <button
          className="w-full py-4 text-lg font-semibold bg-blue-800 rounded-lg shadow-xl hover:bg-blue-900 transition transform hover:scale-105"
          onClick={() => router.push("/admin")}
        >
          Admin (Register Patients)
        </button>

        <button
          className="w-full py-4 text-lg font-semibold bg-green-700 rounded-lg shadow-xl hover:bg-green-800 transition transform hover:scale-105"
          onClick={() => router.push("/loginDoctor")}
        >
          Doctor Portal (Login/Register)
        </button>

        <button
          className="w-full py-4 text-lg font-semibold bg-purple-700 rounded-lg shadow-xl hover:bg-purple-800 transition transform hover:scale-105"
          onClick={() => router.push("/loginPatient")}
        >
          Patient Portal
        </button>
      </div>
    </div>
  );
}