const mockSend = jest.fn();

class S3Client {
  send = mockSend;
}

class CopyObjectCommand {
  input: unknown;

  constructor(input: unknown) {
    this.input = input;
  }
}

class DeleteObjectsCommand {
  input: unknown;

  constructor(input: unknown) {
    this.input = input;
  }
}

class ListObjectsV2Command {
  input: unknown;

  constructor(input: unknown) {
    this.input = input;
  }
}

jest.mock(
  "@aws-sdk/client-s3",
  () => ({ S3Client, CopyObjectCommand, DeleteObjectsCommand, ListObjectsV2Command }),
  { virtual: true }
);

const mockGetInstructorGroups = jest.fn();
jest.mock("../lambda/lib/services/groupsService", () => ({
  getInstructorGroups: mockGetInstructorGroups,
}));

const routes = require("../lambda/lib/instructor/patientRoutes.js");

const sourcePatient = {
  patient_id: "source-patient",
  simulation_group_id: "source-group",
  patient_name: "Alex Patient",
  patient_number: 4,
  patient_age: 63,
  patient_gender: "female",
  patient_prompt: "A complete patient persona",
  voice_id: "amy",
  llm_completion: false,
};

function createSql({ existingNames = [] }: { existingNames?: string[] } = {}) {
  const queries: Array<{ text: string; values: unknown[] }> = [];
  const sql = jest.fn(async (strings: TemplateStringsArray, ...values: unknown[]) => {
    const text = strings.join("?");
    queries.push({ text, values });

    if (text.includes('SELECT * FROM "patients"')) return [sourcePatient];
    if (text.includes('SELECT patient_name FROM "patients"')) {
      return existingNames.map((patient_name) => ({ patient_name }));
    }
    if (text.includes('SELECT filetype, filename, metadata, file_number')) {
      return [{ filetype: "pdf", filename: "case", metadata: "source metadata", file_number: 1 }];
    }
    if (text.includes("COALESCE(MAX(patient_number)")) {
      return [{ next_patient_number: 2 }];
    }
    if (text.includes('INSERT INTO "patients"')) {
      return [{ ...sourcePatient, patient_id: "duplicate-patient", patient_name: values[1], simulation_group_id: values[0] }];
    }
    if (text.includes('SELECT enrolment_id FROM "enrolments"')) {
      return [{ enrolment_id: "student-enrolment" }];
    }
    return [];
  }) as jest.Mock & { begin?: jest.Mock };

  sql.begin = jest.fn(async (callback) => callback(sql));
  return { sql, queries };
}

function createEvent(destinationGroupId = "source-group", patientName?: string) {
  return {
    queryStringParameters: {
      source_patient_id: sourcePatient.patient_id,
      destination_simulation_group_id: destinationGroupId,
    },
    body: patientName ? JSON.stringify({ patient_name: patientName }) : "{}",
  };
}

describe("POST /instructor/duplicate_patient", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.BUCKET = "patient-assets";
    mockGetInstructorGroups.mockResolvedValue([
      { simulation_group_id: "source-group", group_name: "Source" },
      { simulation_group_id: "destination-group", group_name: "Destination" },
    ]);
    mockSend.mockImplementation(async (command) => {
      if (command instanceof ListObjectsV2Command) {
        return {
          Contents: [
            { Key: "source-group/source-patient/documents/case.pdf" },
            { Key: "source-group/source-patient/profile_picture/source-patient_profile_pic.png" },
          ],
        };
      }
      return {};
    });
  });

  it("creates an independent same-group copy with assets and fresh interactions", async () => {
    const { sql, queries } = createSql();
    const response = { statusCode: 200, body: "" };

    await routes["POST /instructor/duplicate_patient"]({
      event: createEvent(),
      sqlConnection: sql,
      response,
      userEmailAttribute: "instructor@example.com",
    });

    expect(response.statusCode).toBe(201);
    expect(JSON.parse(response.body)).toMatchObject({
      patient_id: "duplicate-patient",
      patient_name: "Copy of Alex Patient",
      simulation_group_id: "source-group",
      patient_prompt: sourcePatient.patient_prompt,
      voice_id: sourcePatient.voice_id,
      llm_completion: sourcePatient.llm_completion,
    });
    expect(queries.some(({ text }) => text.includes('INSERT INTO "patient_data"'))).toBe(true);
    expect(queries.some(({ text }) => text.includes('INSERT INTO "student_interactions"'))).toBe(true);
    expect(mockSend.mock.calls.filter(([command]) => command instanceof CopyObjectCommand)).toHaveLength(2);
    expect(mockSend.mock.calls.map(([command]) => (command as CopyObjectCommand).input)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ Key: "source-group/duplicate-patient/documents/case.pdf" }),
        expect.objectContaining({ Key: "source-group/duplicate-patient/profile_picture/duplicate-patient_profile_pic.png" }),
      ])
    );
  });

  it("copies into another instructor-owned group and resolves duplicate names", async () => {
    const { sql } = createSql({ existingNames: ["Copy of Alex Patient"] });
    const response = { statusCode: 200, body: "" };

    await routes["POST /instructor/duplicate_patient"]({
      event: createEvent("destination-group", "Copy of Alex Patient"),
      sqlConnection: sql,
      response,
      userEmailAttribute: "instructor@example.com",
    });

    expect(response.statusCode).toBe(201);
    expect(JSON.parse(response.body)).toMatchObject({
      simulation_group_id: "destination-group",
      patient_name: "Copy 2 of Alex Patient",
    });
  });

  it("rejects a destination group the instructor does not own before creating a copy", async () => {
    const { sql, queries } = createSql();
    mockGetInstructorGroups.mockResolvedValue([{ simulation_group_id: "source-group" }]);
    const response = { statusCode: 200, body: "" };

    await routes["POST /instructor/duplicate_patient"]({
      event: createEvent("destination-group"),
      sqlConnection: sql,
      response,
      userEmailAttribute: "instructor@example.com",
    });

    expect(response.statusCode).toBe(403);
    expect(queries.some(({ text }) => text.includes('INSERT INTO "patients"'))).toBe(false);
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("removes copied assets and the duplicate when an asset copy fails", async () => {
    const { sql, queries } = createSql();
    let copyCount = 0;
    mockSend.mockImplementation(async (command) => {
      if (command instanceof ListObjectsV2Command) {
        return {
          Contents: [
            { Key: "source-group/source-patient/documents/case.pdf" },
            { Key: "source-group/source-patient/info/details.pdf" },
          ],
        };
      }
      if (command instanceof CopyObjectCommand) {
        copyCount += 1;
        if (copyCount === 2) throw new Error("S3 copy failed");
      }
      return {};
    });
    const response = { statusCode: 200, body: "" };

    await routes["POST /instructor/duplicate_patient"]({
      event: createEvent(),
      sqlConnection: sql,
      response,
      userEmailAttribute: "instructor@example.com",
    });

    expect(response.statusCode).toBe(500);
    expect(mockSend.mock.calls.some(([command]) => command instanceof DeleteObjectsCommand)).toBe(true);
    expect(queries.some(({ text }) => text.includes('DELETE FROM "patients"'))).toBe(true);
  });
});