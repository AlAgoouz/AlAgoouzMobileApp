function decimal(value:number){
  if(!Number.isFinite(value))throw new Error('قيمة مالية غير صالحة');
  const [mantissa,exponent='0']=String(value).split('e');
  const [whole,fraction='']=mantissa.split('.');
  return {digits:BigInt(whole+fraction),places:fraction.length-Number(exponent)};
}

function toCents(digits:bigint,places:number):bigint{
  if(places<=2)return digits*10n**BigInt(2-places);
  const divisor=10n**BigInt(places-2);
  return divideRounded(digits,divisor);
}

function divideRounded(numerator:bigint,denominator:bigint):bigint{
  const magnitude=numerator<0n?-numerator:numerator;
  const rounded=(magnitude+denominator/2n)/denominator;
  return numerator<0n?-rounded:rounded;
}

function fromCents(cents:bigint):number{
  const value=Number(cents);
  if(!Number.isSafeInteger(value))throw new Error('القيمة المالية أكبر من حد الدقة المسموح');
  return value/100;
}

export function roundMoney(value:number):number{
  const {digits,places}=decimal(value);
  return fromCents(toCents(digits,places));
}

export function multiplyMoney(quantity:number,unitPrice:number):number{
  const left=decimal(quantity);
  const right=decimal(unitPrice);
  return fromCents(toCents(left.digits*right.digits,left.places+right.places));
}

export function sumMoney(values:readonly number[]):number{
  return fromCents(values.reduce((total,value)=>{
    const {digits,places}=decimal(value);
    return total+toCents(digits,places);
  },0n));
}

function exactProducts(products:readonly (readonly [number,number])[]){
  const terms=products.map(([quantity,price])=>{
    const left=decimal(quantity);
    const right=decimal(price);
    return {digits:left.digits*right.digits,places:left.places+right.places};
  });
  const places=Math.max(2,...terms.map(term=>term.places));
  const total=terms.reduce((sum,term)=>sum+term.digits*10n**BigInt(places-term.places),0n);
  return {total,places};
}

export function sumMoneyProducts(products:readonly (readonly [number,number])[]):number{
  const {total,places}=exactProducts(products);
  return fromCents(toCents(total,places));
}

export function divideMoney(value:number, divisor:number):number{
  const {digits,places}=decimal(value);
  return moneyRatio(digits,places,decimal(divisor));
}

function moneyRatio(total:bigint,places:number,divisor:ReturnType<typeof decimal>):number{
  if(divisor.digits<=0n)throw Error('مقسوم عليه غير صالح');
  const scale=2+divisor.places-places;
  const numerator=total*10n**BigInt(Math.max(0,scale));
  const denominator=divisor.digits*10n**BigInt(Math.max(0,-scale));
  return fromCents(divideRounded(numerator,denominator));
}

export function weightedUnitCost(firstQuantity:number,firstCost:number,secondQuantity:number,secondCost:number):number{
  const first=decimal(firstQuantity);
  const second=decimal(secondQuantity);
  const quantityPlaces=Math.max(first.places,second.places);
  const quantity=first.digits*10n**BigInt(quantityPlaces-first.places)+second.digits*10n**BigInt(quantityPlaces-second.places);
  const {total,places}=exactProducts([[firstQuantity,firstCost],[secondQuantity,secondCost]]);
  return moneyRatio(total,places,{digits:quantity,places:quantityPlaces});
}
