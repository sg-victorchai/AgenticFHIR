import React from 'react';
import { Link } from 'react-router-dom';

type InformationPageKind = 'about' | 'privacy' | 'terms' | 'contact';

const pages: Record<
  InformationPageKind,
  {
    title: string;
    intro: string;
    sections: { heading: string; text: string }[];
  }
> = {
  about: {
    title: 'About HealthConnect',
    intro:
      'HealthConnect brings patients, clinicians, front-desk teams, and care managers together around our ground breaking AI native agentic platform',
    sections: [
      {
        heading: 'Connected care',
        text: 'View patient records, coordinate visits and care plans, and review clinical information in one workspace.',
      },
      {
        heading: 'AI with human oversight',
        text: 'our AI persona enables each stakeholder to work faster and safer, and stay in control',
      },
      {
        heading: 'Agentic AI platform',
        text: 'Our platform brings AI personas and orchestration together with ontology services, data and models, and MCP tools and skills. Built-in guardrails and flexible deployment options help teams turn promising AI ideas into dependable workflows under their own governance.',
      },
    ],
  },
  privacy: {
    title: 'Privacy Policy',
    intro:
      'HealthConnect handles health information in the context of your healthcare organization. Access and data handling depend on its deployment and policies.',
    sections: [
      {
        heading: 'Information used',
        text: 'The application retrieves FHIR records for authorized workflows. Searches, document uploads, and AI consultations may process patient information to provide their requested results.',
      },
      {
        heading: 'Access and retention',
        text: 'Sign-in and role-based access help limit who can use each workflow. Your organization controls its connected services, retention rules, and requests to access or correct records.',
      },
      {
        heading: 'Questions about your data',
        text: 'For a patient-record or privacy request, contact the healthcare organization responsible for your records. Do not post patient details in a public support ticket.',
      },
    ],
  },
  terms: {
    title: 'Terms of Service',
    intro:
      'Use HealthConnect only with an account and permissions provided by your healthcare organization.',
    sections: [
      {
        heading: 'Clinical responsibility',
        text: 'AI-generated summaries and proposed resources support, but do not replace, professional clinical judgment. Verify information against source records before relying on it or approving changes.',
      },
      {
        heading: 'Appropriate use',
        text: "Access only records you are permitted to view. Keep credentials private, follow your organization's security policies, and report inaccurate data or suspected unauthorized access through its approved channels.",
      },
      {
        heading: 'Service availability',
        text: 'Features and availability depend on connected FHIR, identity, and AI services. Your organization may have additional terms governing its deployment.',
      },
    ],
  },
  contact: {
    title: 'Contact',
    intro: 'Choose the right channel for your question.',
    sections: [
      {
        heading: 'Patient records and care',
        text: 'Contact your healthcare provider or care team for questions about your health, records, appointments, or corrections to clinical data.',
      },
      {
        heading: 'Access and privacy',
        text: "Ask your organization's help desk or privacy office about account access, permissions, or privacy requests.",
      },
      {
        heading: 'Technical feedback',
        text: 'For a reproducible application issue, use the project’s GitHub Issues page. Never include patient information, credentials, or other sensitive data in a public issue.',
      },
    ],
  },
};

const InformationPage: React.FC<{ kind: InformationPageKind }> = ({ kind }) => {
  const page = pages[kind];

  return (
    <div
      className={`min-h-[65vh] ${kind === 'about' ? 'bg-white' : 'bg-gray-50'}`}
    >
      <main
        className={`mx-auto px-4 py-10 sm:py-14 ${kind === 'about' ? 'max-w-5xl sm:px-6' : 'max-w-3xl'}`}
      >
        <Link
          to="/"
          className="text-sm font-medium text-blue-700 hover:underline"
        >
          Home
        </Link>
        <h1
          className={`mt-6 font-semibold text-gray-900 ${kind === 'about' ? 'text-3xl sm:text-4xl' : 'text-3xl'}`}
        >
          {page.title}
        </h1>
        <p
          className={`mt-3 leading-7 text-gray-700 ${kind === 'about' ? 'max-w-3xl text-lg' : 'text-base'}`}
        >
          {page.intro}
        </p>
        <div
          className={
            kind === 'about'
              ? 'mt-10 grid gap-5 sm:grid-cols-2'
              : 'mt-8 divide-y divide-gray-200 border-t border-gray-200'
          }
        >
          {(kind === 'about' ? page.sections.slice(0, -1) : page.sections).map(
            (section) => (
              <section
                key={section.heading}
                className={
                  kind === 'about'
                    ? 'rounded-lg border border-gray-200 bg-gray-50 p-5 shadow-sm sm:p-6'
                    : 'py-5'
                }
              >
                <h2 className="text-base font-semibold text-gray-900">
                  {section.heading}
                </h2>
                <p className="mt-2 text-sm leading-6 text-gray-700">
                  {section.text}
                </p>
                {kind === 'contact' &&
                  section.heading === 'Technical feedback' && (
                    <a
                      href="https://github.com/sg-victorchai/AgenticFHIR/issues"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-2 inline-block text-sm font-medium text-blue-700 hover:underline"
                    >
                      Open GitHub Issues
                    </a>
                  )}
              </section>
            ),
          )}
        </div>
        {kind === 'about' && (
          <section
            className="mt-5 rounded-lg border border-sky-200 bg-sky-50 p-5 shadow-sm sm:p-8"
            aria-labelledby="platform-title"
          >
            <h2
              id="platform-title"
              className="text-2xl font-semibold text-gray-900 sm:text-3xl"
            >
              Agentic AI platform
            </h2>
            <p className="mt-2 text-base text-slate-600 sm:text-lg">
              From AI experiments to trusted enterprise outcomes
            </p>
            <p className="mt-5 max-w-3xl text-sm leading-7 text-slate-700 sm:text-base">
              {page.sections[page.sections.length - 1].text}
            </p>
            <ul className="mt-7 flex flex-wrap gap-2 sm:gap-3">
              {[
                'Persona & Orchestration',
                'Ontology Services',
                'Data & Models',
                'MCP Tools & Skills',
                'AI Guardrails',
                'Sovereign Deployment',
              ].map((capability) => (
                <li
                  key={capability}
                  className="rounded-full border border-sky-200 bg-white px-3 py-1.5 text-xs font-medium text-sky-800 sm:text-sm"
                >
                  {capability}
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>
    </div>
  );
};

export default InformationPage;
