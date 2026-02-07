import swaggerJsdoc from "swagger-jsdoc";

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "Claims IQ Core API",
      version: "1.0.0",
      description: "API documentation for the Claims File Correction Workbench",
      contact: {
        name: "API Support",
      },
    },
    servers: [
      {
        url: "/api",
        description: "API Server",
      },
    ],
    paths: {
      "/health": {
        get: {
          summary: "Health check endpoint",
          tags: ["System"],
          responses: { "200": { description: "System health status" } },
        },
      },
      "/metrics": {
        get: {
          summary: "Performance metrics",
          tags: ["System"],
          responses: { "200": { description: "Performance metrics data" } },
        },
      },
      "/claims": {
        get: {
          summary: "Get list of claims",
          tags: ["Claims"],
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: "page", in: "query", schema: { type: "integer", default: 1 }, description: "Page number" },
            { name: "limit", in: "query", schema: { type: "integer", default: 50 }, description: "Items per page" },
          ],
          responses: { "200": { description: "Paginated list of claims", content: { "application/json": { schema: { $ref: "#/components/schemas/PaginatedResponse" } } } } },
        },
      },
      "/claims/{claimId}": {
        get: {
          summary: "Get claim by ID",
          tags: ["Claims"],
          security: [{ bearerAuth: [] }],
          parameters: [{ name: "claimId", in: "path", required: true, schema: { type: "string" } }],
          responses: { "200": { description: "Claim details" }, "404": { description: "Claim not found" } },
        },
      },
      "/claims/{claimId}/documents": {
        get: {
          summary: "Get documents for a claim",
          tags: ["Documents"],
          security: [{ bearerAuth: [] }],
          parameters: [{ name: "claimId", in: "path", required: true, schema: { type: "string" } }],
          responses: { "200": { description: "List of documents" } },
        },
      },
      "/documents/{documentId}/corrections": {
        get: {
          summary: "Get corrections for a document",
          tags: ["Corrections"],
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: "documentId", in: "path", required: true, schema: { type: "string" } },
            { name: "page", in: "query", schema: { type: "integer", default: 1 }, description: "Page number" },
            { name: "limit", in: "query", schema: { type: "integer", default: 50 }, description: "Items per page" },
          ],
          responses: { "200": { description: "Paginated list of corrections", content: { "application/json": { schema: { $ref: "#/components/schemas/PaginatedResponse" } } } } },
        },
        post: {
          summary: "Create a correction",
          tags: ["Corrections"],
          security: [{ bearerAuth: [] }],
          parameters: [{ name: "documentId", in: "path", required: true, schema: { type: "string" } }],
          requestBody: { content: { "application/json": { schema: { $ref: "#/components/schemas/Correction" } } } },
          responses: { "201": { description: "Correction created" }, "400": { description: "Validation error" } },
        },
      },
      "/corrections/{correctionId}/status": {
        patch: {
          summary: "Update correction status",
          tags: ["Corrections"],
          security: [{ bearerAuth: [] }],
          parameters: [{ name: "correctionId", in: "path", required: true, schema: { type: "string" } }],
          responses: { "200": { description: "Status updated" } },
        },
      },
      "/documents/{documentId}/annotations": {
        get: {
          summary: "Get annotations for a document",
          tags: ["Annotations"],
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: "documentId", in: "path", required: true, schema: { type: "string" } },
            { name: "page", in: "query", schema: { type: "integer", default: 1 }, description: "Page number" },
            { name: "limit", in: "query", schema: { type: "integer", default: 50 }, description: "Items per page" },
          ],
          responses: { "200": { description: "Paginated list of annotations", content: { "application/json": { schema: { $ref: "#/components/schemas/PaginatedResponse" } } } } },
        },
        post: {
          summary: "Create an annotation",
          tags: ["Annotations"],
          security: [{ bearerAuth: [] }],
          parameters: [{ name: "documentId", in: "path", required: true, schema: { type: "string" } }],
          requestBody: { content: { "application/json": { schema: { $ref: "#/components/schemas/Annotation" } } } },
          responses: { "201": { description: "Annotation created" } },
        },
      },
      "/annotations/{annotationId}": {
        patch: {
          summary: "Update an annotation",
          tags: ["Annotations"],
          security: [{ bearerAuth: [] }],
          parameters: [{ name: "annotationId", in: "path", required: true, schema: { type: "string" } }],
          responses: { "200": { description: "Annotation updated" } },
        },
        delete: {
          summary: "Delete an annotation",
          tags: ["Annotations"],
          security: [{ bearerAuth: [] }],
          parameters: [{ name: "annotationId", in: "path", required: true, schema: { type: "string" } }],
          responses: { "204": { description: "Annotation deleted" } },
        },
      },
      "/claims/{claimId}/validations": {
        get: {
          summary: "Get cross-document validations for a claim",
          tags: ["Validations"],
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: "claimId", in: "path", required: true, schema: { type: "string" } },
            { name: "page", in: "query", schema: { type: "integer", default: 1 }, description: "Page number" },
            { name: "limit", in: "query", schema: { type: "integer", default: 50 }, description: "Items per page" },
          ],
          responses: { "200": { description: "Paginated list of validations", content: { "application/json": { schema: { $ref: "#/components/schemas/PaginatedResponse" } } } } },
        },
      },
    },
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
        },
      },
      schemas: {
        Error: {
          type: "object",
          properties: {
            error: {
              type: "object",
              properties: {
                code: { type: "string" },
                message: { type: "string" },
                details: { type: "object" },
              },
            },
          },
        },
        Pagination: {
          type: "object",
          properties: {
            page: { type: "integer" },
            limit: { type: "integer" },
            total: { type: "integer" },
            totalPages: { type: "integer" },
            hasNext: { type: "boolean" },
            hasPrev: { type: "boolean" },
          },
        },
        PaginatedResponse: {
          type: "object",
          properties: {
            data: { type: "array", items: { type: "object" } },
            pagination: { $ref: "#/components/schemas/Pagination" },
          },
          required: ["data", "pagination"],
        },
        Claim: {
          type: "object",
          properties: {
            id: { type: "string" },
            claimId: { type: "string" },
            policyNumber: { type: "string" },
            claimantName: { type: "string" },
            status: { type: "string", enum: ["open", "in_progress", "resolved", "closed"] },
            createdAt: { type: "string", format: "date-time" },
            updatedAt: { type: "string", format: "date-time" },
          },
        },
        Document: {
          type: "object",
          properties: {
            id: { type: "string" },
            documentId: { type: "string" },
            claimId: { type: "string" },
            filename: { type: "string" },
            contentType: { type: "string" },
            size: { type: "integer" },
            uploadedAt: { type: "string", format: "date-time" },
          },
        },
        Correction: {
          type: "object",
          properties: {
            id: { type: "string", format: "uuid" },
            document_id: { type: "string" },
            claim_id: { type: "string" },
            type: { 
              type: "string", 
              enum: ["typo", "date_error", "phone_format", "name_mismatch", "address_error", "numeric_error", "missing_value", "format_standardization", "data_inconsistency"] 
            },
            severity: { type: "string", enum: ["critical", "warning", "info"] },
            location: { type: "object" },
            found_value: { type: "string" },
            expected_value: { type: "string" },
            confidence: { type: "number", minimum: 0, maximum: 1 },
            status: { type: "string", enum: ["pending", "applied", "rejected", "manual"] },
          },
        },
        Annotation: {
          type: "object",
          properties: {
            id: { type: "string", format: "uuid" },
            type: { type: "string", enum: ["highlight", "comment", "flag", "strikethrough", "underline"] },
            location: { type: "object" },
            text: { type: "string" },
            color: { type: "string" },
            created_by: { type: "string" },
            created_at: { type: "string", format: "date-time" },
          },
        },
        CrossDocumentValidation: {
          type: "object",
          properties: {
            id: { type: "string", format: "uuid" },
            claim_id: { type: "string" },
            field: { type: "string" },
            severity: { type: "string", enum: ["critical", "warning", "info"] },
            documents: { type: "array", items: { type: "object" } },
            status: { type: "string", enum: ["pending", "resolved", "ignored", "escalated"] },
          },
        },
      },
    },
    security: [{ bearerAuth: [] }],
  },
  apis: ["./server/routes.ts"],
};

export const swaggerSpec = swaggerJsdoc(options);
