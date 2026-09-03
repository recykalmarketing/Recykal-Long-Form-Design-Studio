export const projectSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['title', 'summary', 'pages', 'sources'],
  properties: {
    title: { type: 'string' },
    summary: { type: 'string' },
    pages: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['title', 'layout', 'blocks', 'speakerNotes'],
        properties: {
          title: { type: 'string' },
          layout: {
            type: 'string',
            enum: ['cover', 'editorial', 'two-column', 'stat', 'quote', 'timeline', 'comparison', 'process', 'table', 'chart', 'image-led', 'closing']
          },
          blocks: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['type', 'text', 'items', 'label', 'value', 'caption', 'data', 'imagePrompt', 'altText', 'chartType', 'tableHeaders', 'tableRows'],
              properties: {
                type: { type: 'string', enum: ['kicker','heading','subheading','paragraph','bullets','stat','quote','table','chart','image'] },
                text: { type: 'string' },
                items: { type: 'array', items: { type: 'string' } },
                label: { type: 'string' },
                value: { type: 'string' },
                caption: { type: 'string' },
                data: {
                  type: 'array',
                  items: {
                    type: 'object',
                    additionalProperties: false,
                    required: ['label','value','x'],
                    properties: { label: {type:'string'}, value: {type:'number'}, x: {type:'number'} }
                  }
                },
                imagePrompt: { type: 'string' },
                altText: { type: 'string' },
                chartType: { type: 'string', enum:['bar','dot','line','scatter','table'] },
                tableHeaders: { type:'array', items:{type:'string'} },
                tableRows: { type:'array', items:{type:'array', items:{type:'string'} } }
              }
            }
          },
          speakerNotes: { type: 'string' }
        }
      }
    },
    sources: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['title','publisher','url','note'],
        properties: {
          title: {type:'string'},
          publisher: {type:'string'},
          url: {type:'string'},
          note: {type:'string'}
        }
      }
    }
  }
};

export const pageSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['title','layout','blocks','speakerNotes'],
  properties: projectSchema.properties.pages.items.properties
};

export const qcSchema = {
  type:'object',
  additionalProperties:false,
  required:['totalScore','pass','contentFidelity','hierarchy','legibility','consistency','accessibility','uxTaskClarity','visualCraft','exportQuality','blockingDefects','recommendations','summary'],
  properties:{
    totalScore:{type:'number'},
    pass:{type:'boolean'},
    contentFidelity:{type:'number'},
    hierarchy:{type:'number'},
    legibility:{type:'number'},
    consistency:{type:'number'},
    accessibility:{type:'number'},
    uxTaskClarity:{type:'number'},
    visualCraft:{type:'number'},
    exportQuality:{type:'number'},
    blockingDefects:{type:'array',items:{type:'string'}},
    recommendations:{type:'array',items:{type:'string'}},
    summary:{type:'string'}
  }
};

export const outlineSchema = {
  type:'object', additionalProperties:false, required:['title','strategy','items'],
  properties:{
    title:{type:'string'}, strategy:{type:'string'},
    items:{type:'array',items:{type:'object',additionalProperties:false,required:['title','role','layout','visualTreatment','purpose'],properties:{
      title:{type:'string'}, role:{type:'string'}, layout:{type:'string',enum:['cover','editorial','two-column','stat','quote','timeline','comparison','process','table','chart','image-led','closing']}, visualTreatment:{type:'string'}, purpose:{type:'string'}
    }}}
  }
};

export const variationsSchema = {
  type:'object', additionalProperties:false, required:['variations'],
  properties:{variations:{type:'array',minItems:3,maxItems:3,items:pageSchema}}
};
