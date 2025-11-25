import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import "@/styles/EmergencyContacts.css";

import Header from "@/components/Header";
import BackgroundAnimation from "@/components/r3f/BackgroundAnimation";

const getInitialData = () => {
  try {
    const savedData = localStorage.getItem("emergencyData");
    if (savedData) {
      return JSON.parse(savedData);
    }
  } catch (e) {
    console.error("Failed to parse emergency data from storage.", e);
  }

  return {
    medicalInfo: "",
    contacts: [],
  };
};

export default function EmergencyContacts() {
  const [data, setData] = useState(getInitialData());
  const [newContact, setNewContact] = useState({
    name: "",
    phone: "",
    relationship: "",
  });
  const [isEditingMedical, setIsEditingMedical] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    localStorage.setItem("emergencyData", JSON.stringify(data));
    console.log("Emergency data updated in storage.");
  }, [data]);

  const handleContactChange = (index, field, value) => {
    const updatedContacts = data.contacts.map((contact, i) =>
      i === index ? { ...contact, [field]: value } : contact
    );
    setData((prev) => ({ ...prev, contacts: updatedContacts }));
  };

  const handleDeleteContact = (index) => {
    const updatedContacts = data.contacts.filter((_, i) => i !== index);
    setData((prev) => ({ ...prev, contacts: updatedContacts }));
  };

  const handleNewContactChange = (e) => {
    const { name, value } = e.target;
    setNewContact((prev) => ({ ...prev, [name]: value }));
  };

  const handleAddContact = () => {
    if (newContact.name && newContact.phone) {
      const contactToAdd = {
        ...newContact,
        id: Date.now(),
      };
      setData((prev) => ({
        ...prev,
        contacts: [...prev.contacts, contactToAdd],
      }));

      setNewContact({ name: "", phone: "", relationship: "" });
    } else {
      alert("Please provide a name and phone number for the new contact.");
    }
  };

  return (
    <>
      <Header />
      <BackgroundAnimation />
      <article className="emergency-contacts-page">
        <h2>Manage Emergency Information</h2>

        <button className="back-button" onClick={() => navigate(-1)}>
          &larr;
        </button>

        <section className="medical-info-section">
          <h3>Your Medical Information</h3>
          {isEditingMedical ? (
            <div>
              <textarea
                value={data.medicalInfo}
                onChange={(e) =>
                  setData((prev) => ({ ...prev, medicalInfo: e.target.value }))
                }
                rows="3"
              />
              <button onClick={() => setIsEditingMedical(false)}>Save</button>
            </div>
          ) : (
            <div className="info-display">
              <p>{data.medicalInfo || "No medical information recorded."}</p>
              <button onClick={() => setIsEditingMedical(true)}>Edit</button>
            </div>
          )}
        </section>

        <hr />

        <section className="contacts-list-section">
          <h3>Emergency Contacts ({data.contacts.length})</h3>

          {data.contacts.map((contact, index) => (
            <div key={contact.id || index} className="contact-card">
              <input
                name="name"
                value={contact.name}
                onChange={(e) =>
                  handleContactChange(index, "name", e.target.value)
                }
                placeholder="Contact Name"
              />
              <input
                name="phone"
                value={contact.phone}
                onChange={(e) =>
                  handleContactChange(index, "phone", e.target.value)
                }
                placeholder="Phone Number"
                type="tel"
              />
              <input
                name="relationship"
                value={contact.relationship}
                onChange={(e) =>
                  handleContactChange(index, "relationship", e.target.value)
                }
                placeholder="Relationship"
              />
              <button
                className="delete-button"
                onClick={() => handleDeleteContact(index)}
              >
                Delete
              </button>
            </div>
          ))}
        </section>

        <hr />

        <section className="add-contact-section">
          <h3>Add New Contact</h3>
          <div className="contact-input-form">
            <input
              name="name"
              value={newContact.name}
              onChange={handleNewContactChange}
              placeholder="Contact Name"
            />
            <input
              name="phone"
              value={newContact.phone}
              onChange={handleNewContactChange}
              placeholder="Phone Number"
              type="tel"
            />
            <input
              name="relationship"
              value={newContact.relationship}
              onChange={handleNewContactChange}
              placeholder="Relationship"
            />
            <button onClick={handleAddContact}>Add Contact</button>
          </div>
        </section>
      </article>
    </>
  );
}
