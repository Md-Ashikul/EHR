// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract DoctorPatient {
    struct Doctor {
        uint256 id;
        string name;
        address wallet;
    }

    struct Patient {
        uint256 id;
        string name;
        address wallet;
        uint256[] doctorAccess;
    }

    struct Document {
        uint256 patientId;
        uint256 doctorId;
        string cid; 
        string diseaseName;
        string description;
        string imageCID;
        uint256 timestamp;
    }

    mapping(uint256 => Doctor) public doctors;
    mapping(uint256 => Patient) public patients;
    mapping(uint256 => Document[]) public patientDocuments;
    mapping(uint256 => uint256[]) public doctorPatients; // Doctors to their patients
    mapping(uint256 => string) public validDoctors; // Pre-registration data

    event DoctorRegistered(uint256 doctorId, string name, address wallet);
    event PatientRegistered(uint256 patientId, string name, address wallet);
    event DocumentUploaded(uint256 patientId, uint256 doctorId, string cid, string diseaseName, uint256 timestamp);
    event DocumentDeleted(uint256 patientId, uint256 doctorId, uint256 docIndex);
    event AccessGranted(uint256 patientId, uint256 doctorId);
    event AccessRevoked(uint256 patientId, uint256 doctorId);

    // Register doctor data (for pre-verification)
    function registerDoctorData(uint256 _id, string memory _name) public {
        validDoctors[_id] = _name;
    }

    // Register a doctor (FIXED: Uses exact _id from frontend)
    function registerDoctor(string memory _name, uint256 _id, address _wallet) public {
        // Check if the doctor's data is valid (pre-registered)
        require(
            keccak256(bytes(validDoctors[_id])) == keccak256(bytes(_name)),
            "Doctor ID or name is invalid"
        );
        
        // Ensure this ID hasn't already been registered
        require(doctors[_id].id == 0, "Doctor already registered at this ID");
        
        // Maps the doctor to the exact ID provided
        doctors[_id] = Doctor(_id, _name, _wallet);
        
        emit DoctorRegistered(_id, _name, _wallet);
    }

    // Register a patient (FIXED: Uses exact _id from frontend)
    function registerPatient(uint256 _id, string memory _name, address _wallet) public {
        // Ensure this ID hasn't already been registered
        require(patients[_id].id == 0, "Patient already registered at this ID");
        
        // Maps the patient to the exact ID provided
        patients[_id] = Patient(
            _id, 
            _name, 
            _wallet, 
            new uint256[](0)
        );
        
        emit PatientRegistered(_id, _name, _wallet);
    }

    // Upload a document
    function uploadDocument(
        uint256 _patientId,
        uint256 _doctorId,
        string memory _cid,
        string memory _diseaseName,
        string memory _description,
        string memory _imageCID
    ) public {
        // Only an authorized doctor can upload
        require(
            isDoctorAuthorized(_patientId, _doctorId),
            "Doctor is not authorized"
        );

        patientDocuments[_patientId].push(
            Document(
                _patientId,
                _doctorId,
                _cid,
                _diseaseName,
                _description,
                _imageCID,
                block.timestamp
            )
        );

        emit DocumentUploaded(
            _patientId,
            _doctorId,
            _cid,
            _diseaseName,
            block.timestamp
        );
    }

    // Delete a document (Only by the doctor who created it)
    function deleteDocument(uint256 _patientId, uint256 _docIndex) public {
        require(_docIndex < patientDocuments[_patientId].length, "Document index out of bounds");
        
        Document storage doc = patientDocuments[_patientId][_docIndex];
        
        // Find the doctor's wallet address from the doctor's ID
        address doctorWallet = doctors[doc.doctorId].wallet;
        
        // Only the doctor who created this document can delete it
        require(msg.sender == doctorWallet, "Only the creating doctor can delete");

        // Swap and pop
        patientDocuments[_patientId][_docIndex] = patientDocuments[_patientId][patientDocuments[_patientId].length - 1];
        patientDocuments[_patientId].pop();

        emit DocumentDeleted(_patientId, doc.doctorId, _docIndex);
    }

    // Get patient documents (for the patient)
    function getPatientDocuments(uint256 _patientId) public view returns (Document[] memory) {
        // Only the patient can see all their documents
        require(
            msg.sender == patients[_patientId].wallet,
            "Only the patient can access this"
        );
        return patientDocuments[_patientId];
    }

    // Get patient documents (for an authorized doctor)
    function getPateintDocumentsByDoctor(uint256 _patientId, uint256 _doctorId) public view returns (Document[] memory) {
        require(
            isDoctorAuthorized(_patientId, _doctorId),
            "Doctor is not authorized"
        );
        return patientDocuments[_patientId];
    }
    
    // Helper function for patient dashboard
    function getPatientDoctorAccess(uint256 _patientId) public view returns (uint256[] memory) {
        require(
            msg.sender == patients[_patientId].wallet, 
            "Only patient can view access list"
        );
        return patients[_patientId].doctorAccess;
    }

    // Give access to a doctor
    function giveAccess(uint256 _patientId, uint256 _doctorId) public {
        // Only the patient can give access
        require(
            msg.sender == patients[_patientId].wallet,
            "Only the patient can give access"
        );

        // Check if already authorized
        require(
            !isDoctorAuthorized(_patientId, _doctorId),
            "Doctor already has access"
        );

        patients[_patientId].doctorAccess.push(_doctorId);
        doctorPatients[_doctorId].push(_patientId);

        emit AccessGranted(_patientId, _doctorId);
    }

    // Revoke access from a doctor
    function revokeAccess(uint256 _patientId, uint256 _doctorId) public {
        // Only the patient can revoke access
        require(
            msg.sender == patients[_patientId].wallet,
            "Only the patient can revoke access"
        );

        // Find and remove doctor from patient's access list
        uint256 doctorIndex = findDoctorIndex(_patientId, _doctorId);
        require(doctorIndex != type(uint256).max, "Doctor not found in access list");

        patients[_patientId].doctorAccess[doctorIndex] = patients[_patientId].doctorAccess[patients[_patientId].doctorAccess.length - 1];
        patients[_patientId].doctorAccess.pop();

        // Find and remove patient from doctor's patient list
        uint256[] storage patientList = doctorPatients[_doctorId];
        for (uint256 i = 0; i < patientList.length; i++) {
            if (patientList[i] == _patientId) {
                patientList[i] = patientList[patientList.length - 1];
                patientList.pop();
                break;
            }
        }

        emit AccessRevoked(_patientId, _doctorId);
    }

    // Check if a doctor is authorized
    function isDoctorAuthorized(uint256 _patientId, uint256 _doctorId) public view returns (bool) {
        for (uint256 i = 0; i < patients[_patientId].doctorAccess.length; i++) {
            if (patients[_patientId].doctorAccess[i] == _doctorId) {
                return true;
            }
        }
        return false;
    }

    // Helper to verify a patient by wallet
    function patientVerification(uint256 _patientId) public view returns (bool) {
         // Check if the caller is the patient by comparing msg.sender to the patient's wallet address
        return msg.sender == patients[_patientId].wallet;
    }

    // Helper to find doctor index for removal
    function findDoctorIndex(uint256 _patientId, uint256 _doctorId) private view returns (uint256) {
        for (uint256 i = 0; i < patients[_patientId].doctorAccess.length; i++) {
            if (patients[_patientId].doctorAccess[i] == _doctorId) {
                return i;
            }
        }
        return type(uint256).max; // Return max value if not found
    }
}