# 🚀 AgenticFHIR

> **Revolutionizing Healthcare Software Development with HL7 FHIR + GenAI**

Transform FHIR metadata into production-ready healthcare applications automatically. No manual UI coding. No tedious form building. Just intelligent, AI-powered development.

[![FHIR R5](https://img.shields.io/badge/FHIR-R5-blue.svg)](https://www.hl7.org/fhir)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.2-blue.svg)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-18.2-61dafb.svg)](https://reactjs.org/)
[![Powered by GitHub Copilot](https://img.shields.io/badge/Powered%20by-GitHub%20Copilot-green.svg)](https://github.com/features/copilot)

---

## ✨ What Makes This Special

**AgenticFHIR** demonstrates the transformative power of combining **HL7 FHIR metadata** with **AI-assisted coding**. Instead of manually building healthcare UIs, we leverage FHIR's rich metadata to auto-generate intelligent interfaces.

### 🎯 Core Capabilities

| Feature                    | What It Does                                                               |
| -------------------------- | -------------------------------------------------------------------------- |
| 🎨 **Auto UI Generation**  | Parse FHIR StructureDefinition → Generate list views with summary elements |
| 📝 **Smart CRUD Forms**    | Read data types & constraints → Render appropriate form controls           |
| 🔍 **Intelligent Filters** | Extract SearchParameters → Create dynamic filter UI                        |
| ✅ **Built-in Validation** | Apply FHIR validation rules → Client-side data validation                  |
| ⚡ **API-Driven Actions**  | Parse OperationDefinition → Generate action buttons & workflows            |

---

## 🏗️ Project Structure

```
AgenticFHIR/
├── 📁 .copilot/              # AI prompt instructions (self-generated!)
│   ├── fhir-typescript-spa-prompt.md
│   ├── FHIRResourceUIDevGuide.md
│   └── ObservationUiGuide.md
├── 📁 fhirprofile/           # FHIR metadata resources
│   ├── structure-definition-patient.json
│   ├── structure-definition-observation.json
│   └── ...
└── 📁 fhirweb-spa/           # React SPA (Copilot co-created)
    ├── src/
    │   ├── pages/            # Auto-generated resource pages
    │   ├── components/       # Reusable UI components
    │   └── services/         # FHIR API integration
    └── ...
```

---

## 🎓 The 5-Part Journey

### Part 1: **Intelligent List Views** ✅

Parse `isSummary` elements from StructureDefinition → Auto-generate paginated table views

### Part 2: **Dynamic CRUD Forms** ✅

Extract data types & cardinality → Render appropriate form controls with validation

### Part 3: **Smart Search & Filters** 🚧

Read SearchParameter metadata → Generate dynamic filter UI

### Part 4: **Automated Validation** 🚧

Apply FHIR constraints → Client-side validation rules

### Part 5: **Action-Driven UI** 🚧

Parse OperationDefinition → Context-aware action buttons & workflows

---

## 💡 Key Innovation: From Metadata to Code

**Traditional Approach:**

```typescript
// Manual column definitions - tedious and error-prone
const columns = [
  { header: 'ID', accessor: 'id' },
  { header: 'Status', accessor: 'status' },
  { header: 'Code', accessor: 'code.text' },
  // ... hundreds of lines
];
```

**AgenticFHIR Approach:**

```typescript
// Automatically extract from FHIR StructureDefinition
const summaryElements =
  await getSummaryElementsFromStructureDefinition('Observation');
const columns = generateColumnsFromMetadata(summaryElements);
// ✨ Done! Scales to ANY FHIR resource
```

---

## 🚀 Quick Start

```bash
# Install dependencies
cd fhirweb-spa
npm install

# Start development server
npm run dev

# Open browser to http://localhost:3000/smartapp
```

**View the magic:**

1. 🔍 Search patients
2. 📊 Browse observations, medications, care plans
3. 📄 CRUD operations with auto-generated forms
4. ⏭️ Pagination, filtering, sorting - all automatic

---

## 🎯 Development Stats

| Milestone                          | Time Spent | Result                                                                    |
| ---------------------------------- | ---------- | ------------------------------------------------------------------------- |
| 🧠 Initial prompt engineering      | 2 hours    | [Comprehensive SPA instructions](/.copilot/fhir-typescript-spa-prompt.md) |
| 🏗️ Basic SPA + 3 resources         | 4 hours    | Working Patient/Observation/Medication/CarePlan views                     |
| 🤖 Generic UI generator            | 2 hours    | [Universal FHIR Resource UI Guide](/.copilot/FHIRResourceUIDevGuide.md)   |
| ➕ Adding new resource (Encounter) | **30 min** | Fully functional CRUD with pagination                                     |

**30 minutes to add a complete resource!** That's the power of metadata-driven development.

---

## 🌟 Why HL7 FHIR?

[HL7 FHIR](https://www.hl7.org/fhir) is the healthcare industry standard for:

- ✅ **Consistent Data Models**: Patient, Encounter, Medication, etc.
- 🔧 **Extensibility**: Built-in extension mechanism
- 📋 **Rich Metadata**: StructureDefinition, SearchParameter, OperationDefinition
- 🌐 **API Standards**: RESTful, uniform interface
- 🎨 **Custom Resources**: Define your own using FHIR syntax

### Core Metadata Resources

| Resource                | Purpose                                   | Link                                                     |
| ----------------------- | ----------------------------------------- | -------------------------------------------------------- |
| **StructureDefinition** | Data model, constraints, summary elements | [Spec](https://hl7.org/fhir/R5/structuredefinition.html) |
| **SearchParameter**     | Searchable fields, filter definitions     | [Spec](https://hl7.org/fhir/R5/searchparameter.html)     |
| **OperationDefinition** | Custom operations, input/output           | [Spec](https://hl7.org/fhir/R5/operationdefinition.html) |

## 🎯 Key Takeaways

1. **AI + Metadata = Acceleration**: GitHub Copilot + FHIR metadata = 10x faster development
2. **Embrace or Perish**: AI-assisted coding is not optional—it's the future
3. **Standards Enable Intelligence**: Rich metadata makes automation possible
4. **Scalability**: One prompt pattern works for ALL resources
5. **Maintainability**: Update metadata → UI updates automatically

---

## 🛠️ Tech Stack

- **Frontend**: React 18, TypeScript, Vite, Tailwind CSS
- **State**: Redux Toolkit, RTK Query
- **FHIR**: fhir-kit-client, FHIR R5
- **AI**: GitHub Copilot (prompt engineering + code generation)

---

## 🚀 Try It Out!

Explore the intersection of healthcare standards and AI-powered development. See how metadata-driven architecture transforms the developer experience.

**Star this repo** if you believe in the future of intelligent software development! ⭐

---

## 📝 License

MIT License - See [LICENSE](LICENSE) for details

---

<div align="center">

**Built with ❤️ using GitHub Copilot and HL7 FHIR**

[Report Bug](https://github.com/sg-victorchai/AgenticFHIR/issues) · [Request Feature](https://github.com/sg-victorchai/AgenticFHIR/issues)

</div>
