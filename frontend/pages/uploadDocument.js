import { useState } from "react";
import { useRouter } from "next/router";

export default function UploadDocument() {
  const router = useRouter();
  const { doctorId, patientId: qPid } = router.query;
  const [patientId, setPatientId] = useState(qPid || "");
  const [diseaseName, setDiseaseName] = useState("");
  const [description, setDescription] = useState("");
  const [imageFile, setImageFile] = useState(null);
  const [message, setMessage] = useState("");

  const handleImageChange = (e) => setImageFile(e.target.files[0]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMessage("Uploading...");
    
    const reader = new FileReader();
    reader.onloadend = async () => {
      const base64Image = reader.result.split(",")[1];
      try {
        const res = await fetch("/api/uploadDocument", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ patientId, doctorId, diseaseName, description, imageFile: base64Image }),
        });
        const data = await res.json();
        if(res.ok) setMessage("Success! CID: " + data.imageCID);
        else setMessage("Error: " + data.error);
      } catch(e) { setMessage("Upload failed"); }
    };
    if (imageFile) reader.readAsDataURL(imageFile);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 p-6">
      <form onSubmit={handleSubmit} className="bg-white p-8 rounded shadow-lg w-full max-w-md space-y-4">
        <h2 className="text-2xl font-bold mb-4">Upload Document</h2>
        <input placeholder="Patient ID" value={patientId} onChange={e=>setPatientId(e.target.value)} className="w-full p-2 border rounded" />
        <input placeholder="Disease Name" value={diseaseName} onChange={e=>setDiseaseName(e.target.value)} className="w-full p-2 border rounded" />
        <textarea placeholder="Description" value={description} onChange={e=>setDescription(e.target.value)} className="w-full p-2 border rounded" />
        <input type="file" onChange={handleImageChange} className="w-full" />
        <button type="submit" className="w-full bg-teal-600 text-white py-2 rounded">Upload</button>
        {message && <p className="text-sm mt-2">{message}</p>}
      </form>
    </div>
  );
}