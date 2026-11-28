import { apiRequest } from "./apiClient";
export async function getStaff({page=1,limit=50,search="",employeeType="",status=""}={}){const p=new URLSearchParams({page:String(page),limit:String(limit)});if(search.trim())p.set("search",search.trim());if(employeeType)p.set("employeeType",employeeType);if(status)p.set("status",status);const r=await apiRequest("/staff?"+p.toString());return {staff:r?.data??[],pagination:r?.pagination??null};}
export async function getLinkableStaffUsers(employeeType){const r=await apiRequest("/staff/linkable-users?employeeType="+encodeURIComponent(employeeType));return r?.data??[];}
export async function createStaff(body){const r=await apiRequest("/staff",{method:"POST",body});return r?.data??null;}
export async function getStaffById(id){const r=await apiRequest("/staff/"+encodeURIComponent(id));return r?.data??null;}
export async function updateStaff(id,body){const r=await apiRequest("/staff/"+encodeURIComponent(id),{method:"PATCH",body});return r?.data??null;}
export async function updateStaffStatus(id,body){const r=await apiRequest("/staff/"+encodeURIComponent(id)+"/status",{method:"PATCH",body});return r?.data??null;}
export async function getStaffHistory(id){const r=await apiRequest("/staff/"+encodeURIComponent(id)+"/history");return r?.data??[];}
