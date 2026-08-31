import { projectRepository } from './projectRepository.js';

/**
 * Project-scoped persistence boundary for contacts.
 *
 * Contacts intentionally remain in Project.contacts. This repository only
 * centralizes access to that existing collection and delegates persistence to
 * ProjectRepository.
 */
export class ContactRepository{
  constructor(projectRepo = projectRepository){
    this.projectRepository = projectRepo;
  }

  list(projectId){
    return this.projectRepository.scoped(projectId, 'contacts');
  }

  listPage(projectId, { cursor = 0, limit = 50, includeTrashed = false } = {}){
    const start = Math.max(0, Number(cursor) || 0);
    const size = Math.min(200, Math.max(1, Number(limit) || 50));
    const all = this.list(projectId).filter(item => includeTrashed || !item.trashed);
    return {
      items: all.slice(start, start + size),
      cursor: start + size < all.length ? start + size : null,
    };
  }

  get(projectId, contactId){
    if(!contactId) return null;
    return this.list(projectId).find(contact =>
      String(contact.id) === String(contactId)
    ) || null;
  }

  save(projectId, contact){
    if(!projectId || !contact) return null;

    const saved=this.projectRepository.updateProject(projectId, project => {
      const contacts=Array.isArray(project.contacts) ? [...project.contacts] : [];
      const index=contacts.findIndex(item => String(item.id) === String(contact.id));
      if(index >= 0) contacts[index]=contact;
      else contacts.push(contact);
      return {...project, contacts};
    });

    return saved ? contact : null;
  }

  update(projectId, contactId, updater){
    if(!projectId || !contactId) return null;
    const current=this.get(projectId, contactId);
    if(!current) return null;

    const updated=typeof updater === 'function' ? updater(current) : updater;
    if(!updated) return null;

    const saved=this.projectRepository.updateProject(projectId, project => {
      if(!Array.isArray(project.contacts)) return project;
      const index=project.contacts.findIndex(contact =>
        String(contact.id) === String(contactId)
      );
      if(index < 0) return project;

      const contacts=[...project.contacts];
      contacts[index]=updated;
      return {...project, contacts};
    });

    return saved && updated ? updated : null;
  }

  softDelete(projectId, contactId){
    return this.update(projectId, contactId, contact => ({
      ...contact,
      trashed:true,
    }));
  }
}

export const contactRepository = new ContactRepository();
