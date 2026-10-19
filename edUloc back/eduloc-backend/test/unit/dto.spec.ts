import 'reflect-metadata';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  ApproveApplicationDto, CreateDegreeEquivalenceDto, DegreeDecisionDto, SetAcademicLevelDto,
} from '../../src/modules/admin/dto';
import { equivalenceKey } from '../../src/modules/admin/degree-equivalences.service';
import { TutorApplicationInputDto, TutorDocumentRegistrationDto } from '../../src/modules/tutors/tutor-applications.dto';
import { ProfileDto } from '../../src/modules/tutors/tutors.dto';

const UUID = '0b1f3c1e-6a33-4b6a-9a52-5d2f2a3d1c11';
const errorsOf = async (cls: new () => object, plain: object) =>
  (await validate(plainToInstance(cls, plain), { whitelist: true, forbidNonWhitelisted: true })).map((e) => e.property);

const baseApplication = {
  firstName: 'Aina', lastName: 'Rakoto', email: 'aina@example.mg', phone: '0340000000',
  experiences: [], subjects: [], offers: [], places: [], availabilities: [],
};

describe('champs de profil du diplôme (formulaire tuteur)', () => {
  it('le dossier accepte intitulé, domaine, spécialisation, établissement et pays', async () => {
    const errors = await errorsOf(TutorApplicationInputDto, {
      ...baseApplication,
      highestDegree: 'OTHER',
      degreeTitle: 'DUT Génie électrique',
      fieldOfStudy: 'Électricité',
      specialization: 'Automatismes industriels',
      degreeInstitution: 'IUT de Antsiranana',
      degreeCountry: 'Madagascar',
    });
    assert.deepEqual(errors, []);
  });

  it('le PATCH du profil accepte les mêmes champs', async () => {
    const errors = await errorsOf(ProfileDto, {
      degreeTitle: 'Master Informatique', fieldOfStudy: 'Informatique', specialization: 'Cryptographie',
      degreeInstitution: 'Université de Fianarantsoa', degreeCountry: 'Madagascar',
    });
    assert.deepEqual(errors, []);
  });

  it('refuse une valeur trop longue', async () => {
    assert.deepEqual(await errorsOf(ProfileDto, { degreeCountry: 'x'.repeat(101) }), ['degreeCountry']);
  });

  it('le tuteur ne peut PAS écrire son niveau académique validé', async () => {
    assert.deepEqual(await errorsOf(ProfileDto, { academicLevelId: UUID }), ['academicLevelId']);
    assert.deepEqual(await errorsOf(TutorApplicationInputDto, { ...baseApplication, academicLevelNote: 'x' }), ['academicLevelNote']);
  });

  it('accepte CV, relevé de notes et certificat de scolarité comme types de document', async () => {
    for (const type of ['CV', 'TRANSCRIPT', 'ENROLLMENT_CERTIFICATE']) {
      assert.deepEqual(await errorsOf(TutorDocumentRegistrationDto, { uploadId: UUID, type }), [], type);
    }
    assert.deepEqual(await errorsOf(TutorDocumentRegistrationDto, { uploadId: UUID, type: 'SELFIE' }), ['type']);
  });
});

describe('DTO admin', () => {
  it('l’approbation accepte un corps vide ou un niveau + motif', async () => {
    assert.deepEqual(await errorsOf(ApproveApplicationDto, {}), []);
    assert.deepEqual(
      await errorsOf(ApproveApplicationDto, { academicLevelId: UUID, academicLevelNote: 'Expert', degreeEquivalenceId: UUID }),
      [],
    );
    assert.deepEqual(await errorsOf(ApproveApplicationDto, { academicLevelId: 'L2' }), ['academicLevelId']);
  });

  it('le niveau fixé exige un identifiant', async () => {
    assert.deepEqual(await errorsOf(SetAcademicLevelDto, {}), ['academicLevelId']);
  });

  it('une équivalence se crée et se tranche avec un statut connu et un diplôme parmi BAC/LICENCE/MASTER/DOCTORAT', async () => {
    assert.deepEqual(
      await errorsOf(CreateDegreeEquivalenceDto, {
        degreeTitle: 'DUT', country: 'France', status: 'VALIDATED', equivalentDegree: 'LICENCE', equivalentLevelId: UUID,
      }),
      [],
    );
    assert.deepEqual(await errorsOf(DegreeDecisionDto, { status: 'MAYBE' }), ['status']);
    assert.deepEqual(await errorsOf(DegreeDecisionDto, { status: 'VALIDATED', equivalentDegree: 'OTHER' }), ['equivalentDegree']);
  });
});

describe('rapprochement d’un diplôme déclaré avec une équivalence', () => {
  const base = { degreeTitle: 'DUT Génie électrique', country: 'Madagascar', specialty: '' };

  it('ignore casse, accents, ponctuation et espaces multiples', () => {
    assert.equal(
      equivalenceKey(base),
      equivalenceKey({ degreeTitle: '  dut   genie-electrique ', country: 'MADAGASCAR', specialty: undefined }),
    );
  });

  it('distingue deux pays ou deux spécialités', () => {
    assert.notEqual(equivalenceKey(base), equivalenceKey({ ...base, country: 'France' }));
    assert.notEqual(equivalenceKey(base), equivalenceKey({ ...base, specialty: 'Automatismes' }));
  });
});
