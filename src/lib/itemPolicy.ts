import type {InventoryItem,ItemCategory} from '../types/erp';

export const itemCategories:readonly {id:ItemCategory;label:string}[]=[
 {id:'raw_bean',label:'بن خام'},
 {id:'manufactured_blend',label:'توليفات'},
 {id:'direct_product',label:'منتج مباشر'},
 {id:'drink_recipe',label:'مشروبات لها وصفة'},
 {id:'direct_drink',label:'مشروبات بيع مباشر'},
 {id:'seasoning_recipe',label:'تحويجات'},
 {id:'snack',label:'سناكس'},
];
export const categoryLabel=(category:ItemCategory)=>itemCategories.find(c=>c.id===category)?.label??'منتج مباشر';
export const isRecipeOnUse=(item:Pick<InventoryItem,'category'>)=>['drink_recipe','seasoning_recipe'].includes(item.category);
export const isStockItem=(item:Pick<InventoryItem,'category'>)=>!isRecipeOnUse(item);
export const requiresRecipe=(category:ItemCategory)=>['manufactured_blend','drink_recipe','seasoning_recipe'].includes(category);
export const isPurchasable=(item:Pick<InventoryItem,'category'>)=>!requiresRecipe(item.category);
export const isWholesaleItem=(item:Pick<InventoryItem,'category'>)=>item.category==='manufactured_blend';
