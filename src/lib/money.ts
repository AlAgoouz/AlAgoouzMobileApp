function decimal(value:number){
  if(!Number.isFinite(value))throw new Error('قيمة مالية غير صالحة');
  const [mantissa,exponent='0']=String(value).split('e');
  const [whole,fraction='']=mantissa.split('.');
  return {digits:BigInt(whole+fraction),places:fraction.length-Number(exponent)};
}

function toCents(digits:bigint,places:number):bigint{
  if(places<=2)return digits*10n**BigInt(2-places);
  const divisor=10n**BigInt(places-2);
  const magnitude=digits<0n?-digits:digits;
  const rounded=(magnitude+divisor/2n)/divisor;
  return digits<0n?-rounded:rounded;
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
