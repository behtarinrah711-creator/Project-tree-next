export class ModuleRegistry{
  constructor(){ this.modules = new Map(); }
  register(moduleDefinition){
    if(!moduleDefinition || !moduleDefinition.id) throw new Error('Module definition needs an id');
    this.modules.set(moduleDefinition.id, Object.freeze({ enabled: true, ...moduleDefinition }));
  }
  get(id){ return this.modules.get(id) || null; }
  list(){ return Array.from(this.modules.values()).filter(item => item.enabled !== false); }
}

export const moduleRegistry = new ModuleRegistry();
