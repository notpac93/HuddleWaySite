import { describe, expect, it } from 'vitest';

import { registrationDisplayRecord } from '../../src/lib/ui/registrationDisplay';

describe('registrationDisplayRecord safe projection', () => {
  it('prefers canonical participant and payer summaries', () => {
    const date = new Date('2026-07-26T12:00:00.000Z');
    expect(
      registrationDisplayRecord(
        'registration-a',
        {
          participantSummary: {
            fullName: ' Canonical Player ',
            firstName: 'Ignored',
          },
          payerSummary: {
            displayName: 'Guardian One',
            email: ' guardian@example.test ',
            phoneNumber: '555-0100',
          },
          participantName: 'Legacy Player',
          email: 'legacy@example.test',
          userId: ' user-a ',
          eventId: ' event-a ',
          teamId: ' team-a ',
          teamName: ' Falcons ',
          status: ' submitted ',
        },
        date,
      ),
    ).toEqual({
      id: 'registration-a',
      participantName: 'Canonical Player',
      payerName: 'Guardian One',
      email: 'guardian@example.test',
      phone: '555-0100',
      userId: 'user-a',
      eventId: 'event-a',
      teamId: 'team-a',
      teamName: 'Falcons',
      status: 'submitted',
      date,
    });
  });

  it('uses bounded legacy identity fallbacks without exposing raw answers', () => {
    const projected = registrationDisplayRecord('registration-b', {
      firstName: 'Legacy',
      lastName: 'Player',
      participantEmail: 'participant@example.test',
      phone: '555-0199',
      formData: {
        medicalNotes: 'must never enter the table projection',
      },
      arbitraryAnswer: 'also private',
    });

    expect(projected.participantName).toBe('Legacy Player');
    expect(projected.email).toBe('participant@example.test');
    expect(projected.phone).toBe('555-0199');
    expect(projected).not.toHaveProperty('formData');
    expect(projected).not.toHaveProperty('arbitraryAnswer');
  });

  it('returns explicit nulls for malformed or missing display values', () => {
    expect(
      registrationDisplayRecord('registration-c', {
        participantSummary: [],
        payerSummary: 'invalid',
        participantName: 42,
        email: '',
        phone: null,
        userId: {},
        eventId: [],
      }),
    ).toEqual({
      id: 'registration-c',
      participantName: null,
      payerName: null,
      email: null,
      phone: null,
      userId: null,
      eventId: null,
      teamId: null,
      teamName: null,
      status: null,
      date: null,
    });
  });
});
