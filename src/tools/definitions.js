// Tool definitions for the AI agent
export const tools = [
  {
    name: "create_survey",
    description: "Create a new survey with specified questions and response types. Use this when the user wants to conduct a survey or gather structured information.",
    input_schema: {
      type: "object",
      properties: {
        title: {
          type: "string",
          description: "The title of the survey"
        },
        questions: {
          type: "array",
          description: "Array of survey questions",
          items: {
            type: "object",
            properties: {
              question: { type: "string", description: "The question text" },
              type: {
                type: "string",
                enum: ["text", "multiple_choice", "rating", "yes_no"],
                description: "Type of question"
              },
              options: {
                type: "array",
                items: { type: "string" },
                description: "Options for multiple choice questions"
              }
            },
            required: ["question", "type"]
          }
        }
      },
      required: ["title", "questions"]
    }
  },
  {
    name: "recommend_boiler",
    description: "Recommend a boiler based on home specifications and requirements. Use this when users need help choosing a boiler system. (UK - metric units)",
    input_schema: {
      type: "object",
      properties: {
        home_size_sqm: {
          type: "number",
          description: "Size of the home in square metres (m²)"
        },
        num_bedrooms: {
          type: "number",
          description: "Number of bedrooms in the home"
        },
        num_bathrooms: {
          type: "number",
          description: "Number of bathrooms in the home"
        },
        fuel_type: {
          type: "string",
          enum: ["gas", "oil", "electric", "lpg"],
          description: "Preferred fuel type"
        },
        budget_range: {
          type: "string",
          enum: ["budget", "mid_range", "premium"],
          description: "Budget range for the boiler"
        },
        efficiency_priority: {
          type: "boolean",
          description: "Whether energy efficiency is a high priority"
        }
      },
      required: ["home_size_sqm", "fuel_type"]
    }
  },
  {
    name: "calculate_heating_needs",
    description: "Calculate heating requirements (kW) for a home based on specifications. Use this to determine what size heating system is needed. (UK - metric units)",
    input_schema: {
      type: "object",
      properties: {
        home_size_sqm: {
          type: "number",
          description: "Total living space in square metres (m²)"
        },
        ceiling_height: {
          type: "number",
          description: "Average ceiling height in metres (default 2.4m)"
        },
        insulation_quality: {
          type: "string",
          enum: ["poor", "average", "good", "excellent"],
          description: "Quality of home insulation"
        },
        climate_zone: {
          type: "string",
          enum: ["cold", "moderate", "warm"],
          description: "Climate zone where home is located"
        },
        num_windows: {
          type: "number",
          description: "Approximate number of windows"
        }
      },
      required: ["home_size_sqm"]
    }
  },
  {
    name: "diagnose_boiler_issue",
    description: "Diagnose common boiler problems based on symptoms. Use this when users describe issues with their current boiler.",
    input_schema: {
      type: "object",
      properties: {
        symptoms: {
          type: "array",
          items: {
            type: "string",
            enum: [
              "no_heat",
              "no_hot_water",
              "strange_noises",
              "leaking",
              "low_pressure",
              "pilot_light_out",
              "radiators_cold",
              "error_code",
              "high_bills"
            ]
          },
          description: "List of symptoms the boiler is experiencing"
        },
        error_code: {
          type: "string",
          description: "Error code displayed (if any)"
        },
        boiler_age: {
          type: "number",
          description: "Age of the boiler in years"
        },
        boiler_type: {
          type: "string",
          enum: ["combi", "system", "conventional", "unknown"],
          description: "Type of boiler"
        }
      },
      required: ["symptoms"]
    }
  },
  {
    name: "compare_boilers",
    description: "Compare different boiler models based on specifications and features. Use this when users want to compare multiple options.",
    input_schema: {
      type: "object",
      properties: {
        boiler_ids: {
          type: "array",
          items: { type: "string" },
          description: "Array of boiler model identifiers to compare"
        },
        comparison_criteria: {
          type: "array",
          items: {
            type: "string",
            enum: ["efficiency", "price", "warranty", "output", "size", "features"]
          },
          description: "Criteria to focus on in comparison"
        }
      },
      required: ["boiler_ids"]
    }
  },
  {
    name: "estimate_installation_cost",
    description: "Estimate the total cost of boiler installation including equipment and labor. Use this when users ask about pricing.",
    input_schema: {
      type: "object",
      properties: {
        boiler_type: {
          type: "string",
          enum: ["combi", "system", "conventional"],
          description: "Type of boiler being installed"
        },
        fuel_type: {
          type: "string",
          enum: ["gas", "oil", "electric", "lpg"],
          description: "Fuel type for the boiler"
        },
        installation_complexity: {
          type: "string",
          enum: ["simple_replacement", "upgrade", "new_installation", "complex"],
          description: "Complexity of the installation"
        },
        include_accessories: {
          type: "boolean",
          description: "Whether to include thermostats, controls, etc."
        }
      },
      required: ["boiler_type", "fuel_type", "installation_complexity"]
    }
  },
  {
    name: "save_survey_response",
    description: "Save a user's response to a survey question. Use this to record survey data.",
    input_schema: {
      type: "object",
      properties: {
        survey_id: {
          type: "string",
          description: "ID of the survey"
        },
        question_id: {
          type: "string",
          description: "ID of the question being answered"
        },
        response: {
          type: "string",
          description: "The user's response"
        }
      },
      required: ["survey_id", "question_id", "response"]
    }
  },
  {
    name: "search_documents",
    description: "Search uploaded documents (PDFs, manuals, specs) for specific information. Use this when users ask about content from uploaded documents or need specific details from manuals.",
    input_schema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Search query (keywords or phrases to find in documents)"
        },
        limit: {
          type: "number",
          description: "Maximum number of results to return (default 10)"
        }
      },
      required: ["query"]
    }
  },
  {
    name: "list_documents",
    description: "List all uploaded documents with optional filtering. Use this to show users what documents are available.",
    input_schema: {
      type: "object",
      properties: {
        category: {
          type: "string",
          description: "Filter by category (e.g., 'manuals', 'specs', 'guides')"
        },
        limit: {
          type: "number",
          description: "Maximum number of documents to return (default 20)"
        }
      },
      required: []
    }
  },
  {
    name: "upload_document",
    description: "Upload and process a document (PDF, text file, etc.) to make it searchable. Use this when users want to add documents to the knowledge base. NOTE: This tool expects a file URL or base64 content.",
    input_schema: {
      type: "object",
      properties: {
        file_url: {
          type: "string",
          description: "URL to download the file from (http/https)"
        },
        filename: {
          type: "string",
          description: "Name for the file (with extension, e.g., 'manual.pdf')"
        },
        category: {
          type: "string",
          description: "Category for the document (e.g., 'manuals', 'specs', 'guides', 'general')"
        },
        tags: {
          type: "array",
          items: { type: "string" },
          description: "Optional tags for the document"
        }
      },
      required: ["file_url", "filename"]
    }
  },
  {
    name: "delete_document",
    description: "Delete a document from the knowledge base. Use this when users want to remove a document.",
    input_schema: {
      type: "object",
      properties: {
        document_id: {
          type: "string",
          description: "The ID of the document to delete"
        }
      },
      required: ["document_id"]
    }
  },
  {
    name: "fetch_json_data",
    description: "Fetch and parse JSON data from a URL (works with Google Drive, Dropbox, or any public URL). Use this to access external data sources or when document upload isn't working.",
    input_schema: {
      type: "object",
      properties: {
        url: {
          type: "string",
          description: "URL to fetch JSON from. For Google Drive: use the direct download link (drive.google.com/uc?export=download&id=FILE_ID)"
        },
        description: {
          type: "string",
          description: "Optional description of what data this URL contains"
        }
      },
      required: ["url"]
    }
  }
];
